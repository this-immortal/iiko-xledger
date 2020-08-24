'use strict';
const AWS = require('aws-sdk');
const s3 = new AWS.S3();

class ConfigProvider {

    getConfig = async () => {
        console.log('xl-config: Reading config file', { bucket: process.env.CONFIG_BUCKET, file: 'export_config.json' });

        let data = await s3.getObject({
            Bucket: process.env.CONFIG_BUCKET,
            Key: 'export_config.json'
        }).promise();
    
        return JSON.parse(data.Body);
    }

    getPreset = async (presetName) => {
        let config = await this.getConfig();
        let result = config.presets.filter(x => x.name === presetName);
        return result.length > 0 ? result[0] : null;
    }

}

module.exports = ConfigProvider;
