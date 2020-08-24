'use strict';
const AWS = require('aws-sdk');
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const stepfunctions = new AWS.StepFunctions()

module.exports.handler = async (event) => {

    console.log("xl-fetch-orders: Invoke step function", event);
    const config = await configProvider.getConfig();
    const presets = event.presets === undefined ? config.presets.map(p => p.name) : event.presets;

    if (event.dateFrom === undefined) {
        let today = new Date();
        event.dateFrom = makeDateYmd(today.setDate(today.getDate()-1))
    } 

    if (event.dateTo === undefined) {
        let today = new Date();
        event.dateTo = makeDateYmd(today);
    } 

    // Invoke a step function for every preset
    let stepFunctionPromises = []
    let params = {
      stateMachineArn: process.env.SM_ORDER_FETCHER
    }     

    for (let i = 0; i < presets.length; i++) {
        event.preset = presets[i];
        params.input = JSON.stringify(event);
        console.log("xl-fetch-orders: Invoking PO fetcher for " + event.preset + " :", params)        
        stepFunctionPromises.push(stepfunctions.startExecution(params).promise())       
    }

    await Promise.all(stepFunctionPromises);
    console.log("xl-fetch-orders: Invoked PO fetcher for " + presets.length + " presets");

    return { error: false }
}

let makeDateYmd = (date) => {
    let d = new Date(date);
    var mm = d.getMonth() + 1; // getMonth() is zero-based
    var dd = d.getDate();
  
    return [d.getFullYear(),
            (mm>9 ? '' : '0') + mm,
            (dd>9 ? '' : '0') + dd
           ].join('-');
}
