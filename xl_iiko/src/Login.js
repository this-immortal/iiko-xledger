'use strict';
let ConfigProvider = require("xl-common-cfg");
let configProvider = new ConfigProvider();
const axios = require("axios");

module.exports.handler = async (event) => {

    console.log("xl-iiko: Logging in", event);
    // we expect that config preset name is sent within event.preset
    const preset = await configProvider.getPreset(event.preset);
    if (!preset) {
        console.log("xl-iiko: preset not found: ", event.preset);
        throw "xl-iiko: preset not found!"
    }
    // Authenticating in iiko
    const options = {
        headers: {'Content-Type':'application/json'},
        withCredentials: true
      }

    let cookie = null;  
    let attempts = 0;
    let response = null;
    while (cookie === null && attempts < 10) {
        console.log('Auth: Authentication attempt ' + (attempts+1));
        response = await axios.post(preset.iikoWeb.url+'/api/auth/login', { login: preset.iikoWeb.user, password: preset.iikoWeb.password }, options);
        if (response.headers["set-cookie"] !== undefined) {
            cookie = response.headers["set-cookie"][0]; // get cookie from request
        } else {
            console.log(response.headers);
        }
        attempts++;
    }

    console.log('xl-iiko: logged in as ' + response.data.user.name);

    if (cookie === null) {
        return { error: true, message: 'Could not get session cookie '}
    }

    event.server = preset.iikoWeb.url;
    event.cookie = cookie;

    return event;
}
