
const AWS = require('aws-sdk')
let docClient = new AWS.DynamoDB.DocumentClient()

const Common = require("./common.js")

module.exports.handler = (e, c, cb) => { Common.handler(e, c, cb, async (event, context) => {
    let sessionId = event.pathParameters.sessionId
    let lastTime = event.pathParameters.lastTime

    let data = {}
    let timeKeys = []
    await getData(sessionId, lastTime, data, timeKeys)

    for (let userId in data) {
        data[userId].accelData.sort((a, b) => {
            return a.time < b.time
        })
    }

    // while (timeKeys.length > 0) {
    //     let batchDeleteParams = {
    //         RequestItems: {
    //             [process.env.JIGGLE_DATA]: []
    //         }
    //     }
    //     for (let i = 0; i < 25 && timeKeys.length > 0; ++i) {
    //         batchDeleteParams.RequestItems[process.env.JIGGLE_DATA].push({
    //             DeleteRequest: {
    //                 Key: {
    //                     sessionId: sessionId,
    //                     time: timeKeys[0]
    //                 }
    //             }
    //         })

    //         timeKeys.splice(0, 1)
    //     }

    //     docClient.batchWrite(batchDeleteParams).promise().catch((error) => {
    //         console.log("Delete Error:", error)
    //     })
    // }

    return {
        sessionId: sessionId,
        mostRecentTime: timeKeys[timeKeys.length - 1] || 0,
        data: data
    }
})}

getData = function(sessionId, lastTime, outData, outTimeKeys, startKey) {
    let params = {
        TableName: process.env.JIGGLE_DATA,
        KeyConditionExpression: "#sessionId = :sessionId AND #time > :time",
        ExpressionAttributeNames: {
            "#sessionId": "sessionId",
            "#time": "time"
        },
        ExpressionAttributeValues: {
            ":sessionId": sessionId,
            ":time": parseInt(lastTime, 10)
        },
        ExclusiveStartKey: startKey
    }
    return docClient.query(params).promise().then((response) => {
        for (let item of response.Items) {
            outTimeKeys.push(item.time)
            outData[item.data.userId] = outData[item.data.userId] || {
                accelData: [],
                color: item.data.color,
                senderSyncTime: item.data.senderSyncTime
            }
            outData[item.data.userId].accelData = outData[item.data.userId].accelData.concat(item.data.accelData)
        }

        if (response.LastEvaluatedKey !== undefined) {
            return module.exports.getChallengeData(userId, outData, outTimeKeys, response.LastEvaluatedKey)
        }
    })
}
