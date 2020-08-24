'use strict';

module.exports.handler = async event => {

    console.log('xl-purchase-orders: selecting file to upload', event.xmls);
    let fileRecord = event.xmls.pop();
    event.xml = fileRecord.key;
    event.storeId = fileRecord.storeId;
    event.isLastFile = event.xmls.length === 0;
    event.message = event.isLastFile ? "xl-purchase-orders: Selected the last xml to upload." : "Selected an xml to upload, " + event.xmls.length + " more to go";
    return event;
}