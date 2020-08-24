'use strict';
/**
 * Defines the list of reports (codes) and provides iteration
 */
module.exports.handler = async (event) => {

    console.log("FetchSales: select report", event)

    if (event.reports === undefined || event.reports.length === 0) {
        event.reports = ["OLAP_PRODUCTS", "OLAP_PAYMENTS"]
    }

    event.report = event.reports.pop()
    event.isLastReport = event.reports.length === 0;

    return event;
}