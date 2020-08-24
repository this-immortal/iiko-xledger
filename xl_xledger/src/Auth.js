'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

module.exports.handler = async (event) => {

    // athenticate in XLedger and get a Key
    let cfg = await configProvider.getConfig();
    const promises = cfg.presets
        .filter(x => event.preset === undefined || event.preset === x.name )
        .map(xlAuth);

    await Promise.all(promises);

    return {error: false, message: 'seemed to work'};

}

/**
 * 
 * @param {*} preset 
 */
const xlAuth = async (preset) => {

    axios.defaults.headers.post['Content-Type'] = 'application/soap+xml; charset=utf-8';
    console.log('Reading PFX...');
    const url = preset.xLedger.url + '/WS/Common/Lib/Authentication.asmx';
    const data = [
        '<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">',
            '<soap12:Body>',
                '<LogonKey xmlns="http://ws.xledger.net/">',
                    '<sLogonID>'+ preset.xLedger.username +'</sLogonID>',
                    '<sPassword>'+ preset.xLedger.password +'</sPassword>',
                    '<sApplication>'+ preset.xLedger.application +'</sApplication>',
                '</LogonKey>',
            '</soap12:Body>',
        '</soap12:Envelope>'
    ].join('');

    return axios.post(url, data, {})
        .then(async (res) => {
            let re = new RegExp('<LogonKeyResult>(.*)</LogonKeyResult>');
            let r  = res.data.match(re);
            if (r) {
                console.log('Got key:', preset.name, r[1]);
                await saveFile(preset.name, r[1]);
                return true;
            } 
            
            console.log('Error getting key:', preset.name);
            return null;
        });
}


const saveFile = (presetName, xlKey) => {
    const key =  'xl-keys/' + presetName + '.key';
    console.log('XLedgerAuth: saving key to s3', key);
    return s3.putObject({
            Bucket: process.env.CONFIG_BUCKET,
            Key: key,
            Body: xlKey,
        }).promise();
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