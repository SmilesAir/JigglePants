
const AWS = require('aws-sdk')
let docClient = new AWS.DynamoDB.DocumentClient()

const Common = require("./common.js")

module.exports.handler = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let userId = event.pathParameters.userId
    let sessionId = event.pathParameters.sessionId

    console.log(event)

    let putParams = {
        TableName: process.env.JIGGLE_DATA,
        Item: {
            sessionId: sessionId,
            time: Date.now(),
            data: JSON.parse(event.body)
        }
    }
    await docClient.put(putParams).promise().catch((error) => {
        console.log("Error: ", error)
    })
    return {
        success: true
    }
})}

