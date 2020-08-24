'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const axios = require("axios");

/**
 * Fetches product mapping
 * @param {string} event - must contain the name of the preset to fetch mapping for (event.preset) and iiko login cookie (cookie)
 */
module.exports.handler = async (event) => {

    console.log('xl-product-mapping: got called with params', event)
    console.log('i reading config preset', event.preset);
    let preset = await configProvider.getPreset(event.preset);
    if (preset === null) {
        return {
            error: true,
            message: 'Preset (' + event.preset + ') not found in config!'
        }
    }
    // fetch and build mapping 
    console.log('xl-product-mapping: trying to fetch data from iiko');
    let mapping = await createMapping(preset, event.cookie);

    if (mapping) {
        let res = await storeMapping(preset.name, mapping);
        event.error = false;
        event.message = 'xl-product-mapping: Product Mapping Table created';
    } else {
        event.error = true;
        event.message = 'xl-product-mapping: Failed to create Product Mapping Table!'
    }

    return event;
}

/**
 * Stores Mapping File to S3
 * @param {*} presetName 
 * @param {*} mappingData 
 */
const storeMapping = async (presetName, mappingData) => {
    console.log('xl-product-mapping: Saving mapping to S3 ');
    return s3.putObject({
        Bucket: process.env.CONFIG_BUCKET,
        Key: 'mapping/' + presetName + '/product_groups.json',
        Body: JSON.stringify(mappingData),
    }).promise();
}


/**
 * Fetches products and groups from iiko and returns a mapping table
 * @param {*} preset 
 */
const createMapping = async (preset, cookie) => {

    const url = preset.iikoWeb.url;
    console.log('xl-product-mapping: Authenticating at ', url);
    const options = {
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        withCredentials: true
    }

    try {
        // Fetching Products and Product Groups
        const mapping = axios.get(url + '/api/inventory/purchasing/export/product_groups', options).then(
            // request succeeded
            (res) => {
                if (!res.data.error) {
                    let products = res.data.data;
                    let mapping = {}
                    console.log('xl-product-mapping: fetched ' + Object.keys(products).length + ' products')
                    for (let id in products) {
                        if (products.hasOwnProperty(id)) {
                            mapping[id] = {
                                product: products[id].name,
                                group: (products[id].group !== null && products[id].group !== undefined) ? products[id].group.name : 'UNDEFINED'
                            }
                        }
                    }

                    return mapping;

                } else {
                    console.log('xl-product-mapping: error fetching product groups', res);
                    return null;
                }
            },
            // request rejected
            (res) => {
                console.log('xl-product-mapping: request to iiko failed', res);
                console.log('xl-product-mapping: error fetching product groups');
                return null;
            }
        );

        return mapping;

    } catch (error) {
        console.log(error);
        return null;
    }
}