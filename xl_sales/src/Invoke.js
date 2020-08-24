'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const stepfunctions = new AWS.StepFunctions()
const axios = require("axios");


module.exports.handler = async (event) => {

    console.log("FetchSales: Invoke step function", event);
    const config = await configProvider.getConfig();

    const presets = event.presets === undefined ? config.presets.map(p => p.name) : event.presets;

    if (event.dateFrom === undefined) {
        let today = new Date();
        event.dateFrom = makeDateYmd(today.setDate(today.getDate()-1));
    } 

    if (event.dateTo === undefined) {
        event.dateTo = event.dateFrom;
    } 

    // Invoke a step function for every preset
    let stepFunctionPromises = []
    let params = {
      stateMachineArn: process.env.SM_SALES_FETCHER,
      input: JSON.stringify(event)
    }     

    for (let i = 0; i < presets.length; i++) {
        event.preset = presets[i];
        params.input = JSON.stringify(event);
        console.log("FetchSales: Invoking OLAP fetcher for " + event.preset + " :", params)        
        stepFunctionPromises.push(stepfunctions.startExecution(params).promise())       
    }

    await Promise.all(stepFunctionPromises);
    console.log("FetchSales: Invoked OLAP fetcher for " + presets.length + " presets");

    return { error: false }
}

let makeDateYmd = (date) => {
    let d = new Date(date);
    return d.toISOString().substr(0,10);
}
