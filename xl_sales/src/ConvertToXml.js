'use strict';
const ConfigProvider = require("xl-common-cfg");
const configProvider = new ConfigProvider();
const csv = require("csvjson");
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

module.exports.handler = async event => {

    console.log("xl-sales: convert to xml called ", event);
    const preset = await configProvider.getPreset(event.preset);

    const options = {
        delimiter: ',', // optional
        quote: '"' // optional
    };

    if (event.files && event.files.length > 0) {
        let e = [];

        for (let i = 0; i < event.files.length; i++) {

            console.log('Processing a file', event.files[i]);

            let lines = (await s3.getObject({
                Bucket: process.env.DATA_BUCKET,
                Key: event.files[i].key
            }).promise()).Body.toString();


            let res = csv.toObject(lines, options)

            console.log("Read " + res.length + " lines from S3")

            switch (event.files[i].data_type) {
                case "OLAP_PRODUCTS":
                    console.log('Making sales entries');
                    e.push(res.map(i => {
                        return makeSalesJournalEntry(i, preset).toString();
                    }));
                    break;

                case "OLAP_PAYMENTS":
                    e.push(res.map(i => {
                        return makePaymentJournalEntry(i, preset);
                    }));
                    break;
            }

        }

        if (e.length > 0) {
            const txt = e.reduce((acc, it) => [...acc, ...it]);

            let body = `<?xml version="1.0" encoding="utf-8"?>
                <xml>
                    <JournalEntries>\n
                       ${txt.join("\n")}
                    </JournalEntries>
                </xml>`;

            const exportDate = (new Date()).toISOString().substr(0, 10);

            let dateStr = makeDateYmd(event.dateFrom);
            if (event.dateFrom !== event.dateTo) {
                dateStr = dateStr + '—' + makeDateYmd(event.dateTo);
            }
           
            const key =  `${event.preset}/${exportDate}/xml/SALES-${event.storeCode}—${dateStr}.xml`;

            console.log("xl-sales: storing xml file", key)

            await s3.putObject({
                Bucket: process.env.DATA_BUCKET,
                Key: key,
                Body: body.toString(),
            }).promise();

            event.xml = key;
            event.xmlDataType = 'SalesTransactions';

        } else {
            console.log("xl-sales: unknown error");
        }

    } else {
        console.log("xl-sales: nothing to export");
    }

    event.files = [];
    return event;
}


const makeSalesJournalEntry = (rawData, preset) => {

    let d = new Date(rawData["OpenDate.Typed"]);

    // get posting value
    const restaurant = preset.storeMapping.find(m => m.storeCode === rawData["Department.Code"]);
    if (!restaurant) {
        console.log("xl-mapping: restaurant not found in config preset", rawData)
        throw "xl-mapping: restaurant not found!"
    }
    let data = {
        date: makeDateYmd(d),
        entityCode: restaurant.entityCode
    }
    data.posting = restaurant.restaurantCode;

    // Get accountCode value
    const salesGroup = preset.orderTypeMapping.find(m => {
        let result = (m.delivery_orders && rawData["Delivery.IsDelivery"] === "DELIVERY_ORDER");
        result = result || m.include_order_types.indexOf(rawData["OrderType"]) !== -1;
        result = result && m.exclude_order_types.indexOf(rawData["OrderType"]) === -1; 
        result = result || m.include_price_categories.indexOf(rawData["PriceCategory"]) !== -1;
        result = result && m.exclude_price_categories.indexOf(rawData["PriceCategory"]) === -1;                
        result = result && ( m.accounting_categories.length == 0 || m.accounting_categories.indexOf(rawData["DishCategory.Accounting"]) !== -1)
        return result;
    });

    if (salesGroup === undefined) {
        console.log("xl-convert: unknown sales group, using default account", { requested: rawData, used: preset.defaultAccountForSales });
        data.accountCode = preset.defaultAccountForSales;
    } else {
        data.accountCode = salesGroup.account_code;
    }

    data.fiscalYear = data.date.substr(0, 4);
    data.description = "Order type: " + rawData["OrderType"] + ", Accounting category: " + rawData["DishCategory.Accounting"] + ", Price category: " + rawData["PriceCategory"] + ", Amount: " + rawData["Sales"] + ", VAT:" + rawData["Vat"] + " (" + parseFloat(rawData["VAT.Percent"]) * 100 + "%)";

    data.description = [
        rawData["OrderType"],
        rawData["DishCategory.Accounting"],
        rawData["PriceCategory"],
        rawData["Sales"]
    ].join(', ');
    data.amount = -rawData["Sales"];
    data.vat = -rawData["Vat"];
    data.vatAccount = preset.vatOutputControlAccount;
    let VatRule = makeVatRule(parseFloat(rawData["VAT.Percent"]));

    // create journal entry xml
    return `<JournalEntry>
        <EntityCode>${data.entityCode}</EntityCode>
        <VoucherType>GL</VoucherType>
        <FiscalYear>${data.fiscalYear}</FiscalYear>
        <VoucherDate>${data.date}</VoucherDate>
        <Account>${data.accountCode}</Account>
        <Posting1>${data.posting}</Posting1>
        <Text>${data.description}</Text>
        <Amount>${data.amount}</Amount>
    </JournalEntry>
    <JournalEntry>
        <EntityCode>${data.entityCode}</EntityCode>
        <VoucherType>GL</VoucherType>
        <FiscalYear>${data.fiscalYear}</FiscalYear>
        <VoucherDate>${data.date}</VoucherDate>
        <Account>${data.vatAccount}</Account>
        <Posting1>${data.posting}</Posting1>
        <Text>Vat Amount</Text>
        <Amount>${data.vat}</Amount>
    </JournalEntry>`;

}

const makePaymentJournalEntry = (rawData, preset) => {
    let d = new Date(rawData["OpenDate.Typed"]);

    const restaurant = preset.storeMapping.find(m => m.storeCode === rawData["Department.Code"]);
    if (!restaurant) {
        console.log("xl-convert: restaurant not found in config preset", rawData)
        throw "xl-convert: restaurant not found!"
    }

    let data = {
        date: makeDateYmd(d),
        amount: rawData["Sales"],
        entityCode: restaurant.entityCode
    }
    data.posting = restaurant.restaurantCode;
    data.fiscalYear = data.date.substr(0, 4);
    let paymentType = rawData["PayTypes"];
    let amount = rawData["Sales"];
    // Get accountCode value
    const paymentGroup = preset.paymentTypeMapping.find(m => m.payment_types.indexOf(paymentType) !== -1);

    if (paymentGroup === undefined) {
        console.log("xl-convert: unknown payment type, using default account", { requested: rawData, used: preset.defaultAccountForPayments });
        data.accountCode = preset.defaultAccountForPayments;
    } else {
        data.accountCode = paymentGroup.account_code;
    }
    //data.description = `Revenue: Tender type: ${paymentType}, Amount: ${amount}`;
    data.description = [
        rawData["OrderNum"],
        rawData["CashRegisterName"],
        rawData["PayTypes"],
        rawData["Sales"]
    ].join(', ');

    // create journal entry xml
    return `<JournalEntry>
    <EntityCode>${data.entityCode}</EntityCode>
    <VoucherType>GL</VoucherType>
    <FiscalYear>${data.fiscalYear}</FiscalYear>
    <VoucherDate>${data.date}</VoucherDate>
    <Account>${data.accountCode}</Account>
    <Posting1>${data.posting}</Posting1>
    <Text>${data.description}</Text>
    <Amount>${data.amount}</Amount>
</JournalEntry>`

}



const makeDateYmd = (date) => {
    let d = new Date(date);
    var mm = d.getMonth() + 1; // getMonth() is zero-based
    var dd = d.getDate();

    return [d.getFullYear(),
        (mm > 9 ? '' : '0') + mm,
        (dd > 9 ? '' : '0') + dd
    ].join('');
}

const makeVatRule = (percentage) => {
    if (percentage == 0) {
        return "ZO";
    }

    if (percentage < 0.1) {
        return "RON"
    }

    return "SON";
}

