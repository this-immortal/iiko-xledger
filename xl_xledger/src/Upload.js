'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");
const https = require('https');

module.exports.handler = async (event) => {

    // event must contain: 
    // preset (name of the preset)
    // xml (a filename to upload) 
    // storeId (an id of the store)

    if (event.xml) {
        console.log('UploadToXLedger: New task for ' + event.preset + ': ' + event.xml, event);

        console.log('UploadToXLedger: Getting config settings', event.preset);
        const preset = await configProvider.getPreset(event.preset);

        const store = preset.storeMapping.find(i => i.storeId == event.storeId);
        console.log('UploadToXLedger: Identified store: ', store);

        console.log('UploadToXLedger: Fetching file', event.xml);
        const dataRes = (await s3.getObject({
            Bucket: process.env.DATA_BUCKET,
            Key: event.xml
        }).promise()).Body;

        let entityDefinition = null;

        switch (event.xmlDataType) {
            case 'PurchaseOrder': entityDefinition = 'LG11'; break;
            case 'SalesTransactions': entityDefinition = 'GL02XML'; break; 
        }

        if (!entityDefinition) {
            console.error("xl-xledger: expected to find PurchaseOrder or SalesTransactions in the event.xmlDataType");
            throw "Unknown upload type, can't proceed";
        }

        await upload(preset, dataRes, event.xml.split('/').pop(), store.entityCode, entityDefinition);
        event.xml = undefined;
        event.message = "Uploaded a file to Xledger";
    } else {
        console.log("Nothing to upload");
    }
    return event;

}

let upload = async (preset, data, filename, entityCode, importDefinition) => {

    const key = await readLogonKey(preset.name);
    const cert = await readCertificate(preset.name);
    const url = preset.xLedger.url + '/WS/Common/Lib/FileUpload.asmx';
    const agent = https.Agent({
        pfx: cert,
        passphrase: preset.xLedger.password
      });

    const payload = [
        '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
        '<soap12:Body>',
            '<ReceiveFile xmlns="http://ws.xledger.net/">',
            '<sUserName>' + preset.xLedger.username + '</sUserName>',
            '<sKey>' + key + '</sKey>',
            '<sApplication>'  + preset.xLedger.application + '</sApplication>',
            '<sFileName>'+ importDefinition + '_' + filename + '</sFileName>',
            // Base64-encoded XML
            '<aFile>' + data.toString('base64') + '</aFile>',
            // some xLedger code
            '<sImportCode>'+importDefinition+'</sImportCode>',
            // Entity code for the restaurant:
            '<iEntityCode>' + entityCode + '</iEntityCode>',
            '</ReceiveFile>',
        '</soap12:Body>',
        '</soap12:Envelope>'
    ].join('');

    console.log('Sending to XLedger:', payload);

    axios.defaults.headers.post['Content-Type'] = 'application/soap+xml; charset=utf-8';
    return axios.post(url, payload, { httpsAgent: agent })
        .then(async (res) => {
            let re = new RegExp('<ReceiveFileResult>(.*)</ReceiveFileResult>');
            let r  = res.data.match(re);
            if (r) {
                console.log('UploadToXLedger: Got result!', r[1]);
                return r[1];
            }
            
            console.log('UploadToXLedger: Error parsing result!', res);
            return null;
        })
        .catch((err)=>{ console.log("UploadToXLedger: Server returned error ", err); return null; });
}


/**
 * Reads certificate file from S3
 * Returns null if file is not found
 * @param {*} presetName 
 */
const readCertificate = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'certificates/'+presetName+'.pfx'
    })
    .promise()
    .then((data) => {return data.Body})
    .catch(()=> {console.log('XLedgerAuth: Critical error. Certificate file not found'); return null});
}

/**
 * Reads logon key from S3
 * Returns null if file is not found
 * @param {*} presetName 
 */
const readLogonKey = async (presetName) => {
    return s3.getObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'xl-keys/' + presetName + '.key'
    })
    .promise()
    .then((data) => {return data.Body})
    .catch(()=> {console.log('XLedgerAuth: Critical error. LogonKey file not found'); return null});
}