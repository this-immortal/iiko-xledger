'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const axios = require("axios");

module.exports.handler = async (event) => {
    console.log("Auth: logging out", event);
    const preset = await configProvider.getPreset(event.preset);
    await axios.get(preset.iikoWeb.url+'/api/auth/logout', {
        headers: {'Content-Type':'application/json', Cookie: event.cookie},
        withCredentials: true
    });

    return event;
}
