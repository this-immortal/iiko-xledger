'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const axios = require("axios");

module.exports.handler = async (event) => {

    console.log("Auth: selecting store", event);
    const preset = await configProvider.getPreset(event.preset);
    // first run
    if (event.storeIds === undefined) {
        event.storeIds = preset.storeMapping.map(i => i.storeId)
    }

    event.storeId = event.storeIds.pop()
    event.storeCode = preset.storeMapping.find(s => s.storeId === event.storeId).storeCode;

    // select
    const response = await axios.get(preset.iikoWeb.url+'/api/stores/select/'+event.storeId, {
        headers: {'Content-Type':'application/json', Cookie: event.cookie},
        withCredentials: true
    });

    event.isLastStore = event.storeIds.length === 0;
    console.log("Auth: got response", response)

    if (response.data.error) {
        throw 'Auth: got error!'
    }

    console.log("Auth: selected store: " + response.data.store)

    return event;

}