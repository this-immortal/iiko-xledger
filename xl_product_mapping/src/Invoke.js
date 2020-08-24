'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const stepfunctions = new AWS.StepFunctions()

/**
 * @param {*} event - may contain the list of preset names (event.presets)
 */
module.exports.handler = async (event) => {

    console.log("xl-product-mapping: Got request to invoke product sync step function", event);
    const config = await configProvider.getConfig();
    // Build the list of presets
    const presets = event.presets === undefined ? config.presets.map(p => p.name) : event.presets;

    // Invoke a step function for every preset
    // Step function will start with iikoAuth.login
    let stepFunctionPromises = []
    let params = {
      stateMachineArn: process.env.SM_PRODUCT_MAPPING
    }     

    for (let i = 0; i < presets.length; i++) {
        event.preset = presets[i];
        params.input = JSON.stringify(event);
        console.log("xl-product-mapping: Invoking product sync for " + event.preset + " :", params)        
        stepFunctionPromises.push(stepfunctions.startExecution(params).promise())       
    }

    await Promise.all(stepFunctionPromises);
    console.log("xl-product-mapping: Invoked product sync for" + presets.length + " presets");

    return { error: false }
}