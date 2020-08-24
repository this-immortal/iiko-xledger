'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const lambda = new AWS.Lambda();

if (!String.prototype.encodeHTML) {
    String.prototype.encodeHTML = function () {
      return this.replace(/&/g, '&amp;')
                 .replace(/</g, '&lt;')
                 .replace(/>/g, '&gt;')
                 .replace(/"/g, '&quot;')
                 .replace(/'/g, '&apos;');
    };
  }


module.exports.handler = async (event) => {

    console.log('xl-purchase-orders: Got request to create XMLs ' + event.preset, event);
    const preset = await configProvider.getPreset(event.preset);
    console.log('xl-purchase-orders: getting product mapping');
    const mapping = await readMapping(preset.name);
    if (!mapping) {
        throw 'xl-purchase-orders:Product group mapping file not found!'
    }

    event.xmls = [];
    const l = event.files.length;

    for(let i = 0; i < l; i++) {
        let file = event.files.pop();
        console.log('xl-purchase-orders: Fetching file', file);
        const s3Res = await s3.getObject({
            Bucket: process.env.DATA_BUCKET,
            Key: file
        }).promise();
    
        let order = JSON.parse(s3Res.Body);

        // trying to find a store by storage code
        console.log('xl-purchase-orders: Loading the store by code', order.shipment.storage.code);
        let store = preset.storeMapping.filter(x => x.storeCode === order.shipment.storage.code)[0];
        if (store === undefined) {
            return { error: true, message: 'xl-purchase-orders: Store with code not found: ' + order.shipment.storage.code }
        }

        console.log('xl-purchase-orders: Starting conversion to Xledger format');
        let xmlRecord = {
            storeId: store.storeId 
        }
        await createPOFile(convertOrderToXLedgerFormat(order, store, mapping), preset.name, xmlRecord)

        event.xmls.push(xmlRecord);
        event.xmlDataType = 'PurchaseOrder';
        event.message = event.xmls.length + " XML files have been created and ready to upload";
    }
    
    return event;
}

/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createPOFile = async (data, presetName, keys) => {
    const filename = data.header.ExtOrder+'.xml';
    const date = (new Date()).toISOString().substr(0,10);
    const key = presetName + '/'  + date + '/xml/SHIPMENT-' + filename;
    console.log('ConvertToXML: saving xml to s3 --->', key);
    keys.key = key;
    return s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: objectToXml(data),
        }).promise();
}

 /**
  * Converts iiko Order to a JSON prepared for XML conversion  
  * @param {*} iikoOrder 
  * @param {*} store 
  * @param {*} productMappinng 
  */
const convertOrderToXLedgerFormat = (iikoOrder, store, productMappinng) => {

    console.log('ConvertToXML: converting order to XLedger format');

    let orderHeader = {
        OwnerKey: store.entityCode,
        OrderDate: new Date(iikoOrder.createdAt.date).toISOString('en-GB', { timeZone: 'UTC' }).split('T').join(' ').substring(0,19), // format: 2020-03-10 13:01:22 
        SubledgerCode: iikoOrder.shipment.supplier.code,
        CurrencyCode: 'GBP',
        ExtOrder: iikoOrder.draftNumber,
        GLObject1: 'Cost center',
        GLObjectValue1Code: store.restaurantCode,
        DeliveredDate: new Date(iikoOrder.shipment.date * 1000).toISOString().substring(0, 10), // format: 2020-03-01 
        GoodsReceipt: 'true'
    };

    // XML format sucks when arrays are involved!
    let orerDetails = iikoOrder.shipment.items.map((x, i) => { 
        const pid = x.internalProduct.internalProductId;
        const groupInfo = productMappinng[pid];
        let groupName = 'UNDEFINED';
        if (groupInfo !== undefined && groupInfo !== null) {
            groupName = groupInfo.group;
        } 
        return {
            LineNo: x.num,
            ProductCode: groupName.encodeHTML(),
            Text: [x.supplierProduct.code, x.supplierProduct.name, x.container.name].join(', ').encodeHTML(),
            UnitKey: 3483,
            Quantity: x.receivedQuantity,
            UnitPrice: x.priceWithoutVat,
            TaxRule: x.vatPercent === 0 ? 'ZI' : 'SIN'        
        } 

    });

    return {header: orderHeader, details: orerDetails};
}


/**
 * Creates an XML from PO
 * @param {*} obj 
 */
const objectToXml = (obj) => {
    console.log('ConvertToXML: creating XML');
    const start = ['<PurchaseOrders>\n   <PurchaseOrder>'];
    const h = Object.keys(obj.header).map(x => ['      <', x, '>', obj.header[x], '</', x, '>'].join('')).join('\n');
    const details = obj.details.map(
        item => [
            '      <PurchaseOrderDetails>', 
            Object.keys(item).map(x => ['         <',x,'>',item[x],'</',x,'>'].join('')).join('\n'), 
            '      </PurchaseOrderDetails>'
        ].join('\n')
    ).join('\n');
    const end = ['   </PurchaseOrder>\n</PurchaseOrders>']
    return [start, h, details, end].join('\n');
}

/**
* Reads mapping file from S3
* Returns null if file is not found
* @param {*} presetName 
*/
const readMapping = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'mapping/'+presetName+'/product_groups.json'
    })
    .promise()
    .then((data) => {return JSON.parse(data.Body)})
    .catch(()=> {console.log('stored mapping not found'); return null});
 }