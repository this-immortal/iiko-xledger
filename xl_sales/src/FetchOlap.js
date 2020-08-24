'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

/**
 * Initiates OLAP fetch
 */
module.exports.init = async (event) => {

    console.log("FetchSales: Init called", event);
    axios.defaults.headers.Cookie = event.cookie;
    const requestBody = makePayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.post(event.server+'/api/olap/init', requestBody, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});
    if (response.status !== 200 || response.data.error !== false) {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    }
    event.key = response.data.data;
    event.index = 1;
    return event;
}

/**
 * Checks if the report is ready
 */
module.exports.check = async (event) => {
    console.log("FetchSales: CheckStatus called ", event);
    console.log("FetchSales: Checking status for key: " + event.key + "Attempt " + event.index)

    //const requestBody = makePaymentReportPayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.get(event.server+'/api/olap/fetch-status/'+event.key, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});

    if (response.status !== 200 || response.data.error !== false || response.data.data === "ERROR") {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    }

    console.log("Got response", response.data);

    event.index += 1;
    event.result = response.data.data === "SUCCESS";

    return event;
}


/**
 * Fetches report data
 */
module.exports.fetch = async (event) => {
    console.log("xl-sales: FetchData called ", event);

    const requestBody = makePayload(event.report, event.storeId, event.dateFrom, event.dateTo);
    const response = await axios.post(event.server+'/api/olap/fetch/'+event.key + '/csv', requestBody, {headers: {'Content-Type':'application/json', Cookie: event.cookie}});
    if (event.files === undefined) {
        event.files = [];
    }
    
    if (response.status !== 200) {
        console.log("FetchSales: iikoServer error!", response);
        throw "FetchSales: iikoServer error!"
    } 

    console.log("xl-sales: got response", response);

    if (response.data.length > 10) {
        const exportDate = (new Date()).toISOString().substr(0,10);

        let dateStr = makeDateYmd(event.dateFrom);
        if (event.dateFrom !== event.dateTo) {
            dateStr = dateStr + '—' + makeDateYmd(event.dateTo);
        
          }
        const key = `${event.preset}/${exportDate}/sales/${event.storeCode}-${event.report}—${dateStr}.csv`;
        await createSalesFile(response.data, key);
        console.log("xl-sales: stored fetched data to ", key);
        event.files.push({
            'data_type': event.report,
            'key': key
        });
    } else {
        console.log("xl-sales: no data to store");
    }

    // cleaning up event
    event.key === undefined;
    
    return event;

}


let makePayload = (reportCode, storeId, dateFrom, dateTo) => {
    switch (reportCode) {
        case "OLAP_PRODUCTS": return makeProductReportPayload(storeId, dateFrom, dateTo)
        case "OLAP_PAYMENTS": return makePaymentReportPayload(storeId, dateFrom, dateTo)
    }
}

let makeProductReportPayload = (storeId, dateFrom, dateTo) => {
    return {
        "storeIds": [storeId],
        "olapType": "SALES",
        "categoryFields": [],
        "groupFields": [
          "OpenDate.Typed",
          "Department.Code",
          "Delivery.IsDelivery",
          "OrderType",
          "PriceCategory",
          "DishCategory.Accounting",
          "VAT.Percent"
        ],
        "stackByDataFields": false,
        "dataFields": [
          "Sales",
          "Vat"
        ],
        "calculatedFields": [
          {
            "name": "Sales",
            "title": "Sales",
            "description": "Gross sales",
            "formula": "[DishDiscountSumInt.withoutVAT]",
            "type": "MONEY",
            "canSum": false
          },
          {
            "name": "Vat",
            "title": "Vat",
            "description": "Vat Amount",
            "formula": "[VAT.Sum]",
            "type": "MONEY",
            "canSum": false
          }                   
        ],
        "filters": [
          {
            "field": "OpenDate.Typed",
            "filterType": "date_range",
            "dateFrom": dateFrom,
            "dateTo": dateTo
          },
          {
            "field": "NonCashPaymentType",
            "filterType": "value_list",
            "valueList": [null]
          }
        ]
      }
}


let makePaymentReportPayload = (storeId, dateFrom, dateTo) => {
    return {
        "storeIds": [storeId],
        "olapType": "SALES",
        "categoryFields": [],
        "groupFields": [  
          "OpenDate.Typed",       
          "Department.Code",
          "PayTypes"
        ],
        "stackByDataFields": false,
        "dataFields": [
          "Sales"
        ],
        "calculatedFields": [
          {
            "name": "Sales",
            "title": "Sales",
            "description": "Goss sales",
            "formula": "[DishDiscountSumInt]",
            "type": "MONEY",
            "canSum": false
          }
        ],
        "filters": [
          {
            "field": "OpenDate.Typed",
            "filterType": "date_range",
            "dateFrom": dateFrom,
            "dateTo": dateTo
          },
          {
            "field": "NonCashPaymentType",
            "filterType": "value_list",
            "valueList": [null]
          }
        ]
      }
}

let makeDateYmd = (date) => {
    let d = new Date(date);
    var mm = d.getMonth() + 1; // getMonth() is zero-based
    var dd = d.getDate();
  
    return [d.getFullYear(),
            (mm>9 ? '' : '0') + mm,
            (dd>9 ? '' : '0') + dd
           ].join('');
}


/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createSalesFile = async (data, key) => {

    console.log('FetchSales: saving file --->', key);
    return s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: data,
        }).promise();
    
}