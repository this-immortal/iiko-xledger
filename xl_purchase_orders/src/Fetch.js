'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

module.exports.handler = async (event) => {
    
    console.log('xl-purhase-orders: fetch orders request', event);
    // get config preset
    const preset = await configProvider.getPreset(event.preset);
    // we expect that desired period is sent within event.Payload
    // { dateFrom: '2020-03-01', dateTo: '2020-03-01'}
    const period = {
        dateFrom: event.dateFrom, 
        dateTo: event.dateTo
    };

    // Authenticating in iiko
    const options = {
        headers: { 
            'Content-Type':'application/json', 
            Cookie: event.cookie 
        },
        withCredentials: true
      }

    const fetchOrdersResponse = await axios.post(preset.iikoWeb.url+'/api/inventory/purchasing/export/orders', period, options);

    if (!fetchOrdersResponse.data.error) {
        let orders = fetchOrdersResponse.data.data;
        console.log('xl-purhase-orders: fetched ' + fetchOrdersResponse.data.data.length + ' purchase orders');
        console.log('xl-purhase-orders: Storing files to S3 bucket', process.env.DATA_BUCKET);
        event.files = [];
        let promises = orders.map(order => createInvoiceFile(order, preset.name, event.files));
        const result = await Promise.all(promises);
       
        console.log('xl-purhase-orders: All done. Exported ' + event.files.length + ' files.');
        event.message = event.files.length + " orders ready for processing";
        event.numberOfFiles = event.files.length;
    } else {
        console.log('xl-purhase-orders: error fetching orders', fetchOrdersResponse.data);
        throw 'Order fetching failed';
    }

    return event;
}

/**
 * Creates invoice json file and puts it to S3
 * @param {*} invoice 
 */
let createInvoiceFile = async (invoice, presetName, files) => {
    const filename = invoice.draftNumber+'.json';
    const date = (new Date()).toISOString().substring(0,10);
    const key = presetName + '/' + date + '/shipments/' + filename;
    files.push(key);
    console.log('xl-purhase-orders: --->', key);
    return s3.putObject({
            Bucket: process.env.DATA_BUCKET,
            Key: key,
            Body: JSON.stringify(invoice),
        }).promise();
}