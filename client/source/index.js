/* eslint-disable linebreak-style */
"use strict"

const React = require("react")
const ReactDOM = require("react-dom")
const MobxReact = require("mobx-react")
const Mobx = require("mobx")
import { v4 as uuidv4 } from "uuid"
import { SwatchesPicker } from "react-color"

require("./index.less")

let swactchColors = [ "#f44336", "#9c27b0", "#2196f3", "#4caf50", "#ffeb3b", "#ff9800", "#795548", "#ffffff" ]

let store = Mobx.observable({
    acceleration: undefined,
    accelerationMagnitude: 0,
    historyData: [],
    graphTime: 100,
    graphScrollRate: 5,
    userId: uuidv4(),
    processedData: {},
    syncStartTime: undefined,
    senderSyncTime: undefined,
    color: swactchColors[Math.floor(Math.random() * swactchColors.length)]
})

let cycleSeconds = 10
let cycleLoopCount = 4

if ("ondevicemotion" in window) {
    window.addEventListener("devicemotion", (event) => {
        store.acceleration = event.acceleration
        store.accelerationMagnitude = Math.sqrt(
            event.acceleration.x * event.acceleration.x +
            event.acceleration.y * event.acceleration.y +
            event.acceleration.z * event.acceleration.z)
    })
}

function onWindowChange(isActive) {
    if (!isActive) {
        store.senderSyncTime = undefined
    }
}

window.addEventListener("focus", () => onWindowChange(true))
window.addEventListener("blur", () => onWindowChange(false))

@MobxReact.observer class Main extends React.Component {
    constructor() {
        super()

        let urlParams = {}
        window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, (m, key, value) => {
            urlParams[key] = value
        })

        this.isSender = urlParams.sender === "1"
        this.mostRecentGetTime = 0

        this.sessionId = 9

        if (this.isSender) {
            setInterval(() => {
                if (store.senderSyncTime !== undefined) {
                    this.reportDataToAws()
                }
            }, 1000)

            setInterval(() => {
                this.updateData()
            }, 50)
        } else {
            setInterval(async() => {
                this.processData(await this.getDataFromAws())
            }, 500)
        }

        setInterval(() => {
            let now = Date.now()
            if (this.lastUpdateTime !== undefined) {
                store.graphTime += (now - this.lastUpdateTime) / 1000 * store.graphScrollRate
            }
            this.lastUpdateTime = now
        }, 25)
    }

    updateData() {
        store.historyData.push({
            time: Date.now(),
            magnitude: store.accelerationMagnitude
        })
    }

    getReportData() {
        let data = {
            userId: store.userId,
            accelData: store.historyData.slice(0),
            color: store.color,
            senderSyncTime: store.senderSyncTime
        }

        store.historyData = []

        return data
    }

    reportDataToAws() {
        return fetch(`https://oz1ughjp59.execute-api.us-west-2.amazonaws.com/development/userId/${store.userId}/sessionId/${this.sessionId}/reportData`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(this.getReportData())
        }).then((response) => {
            return response.json()
        }). then((data) => {
            console.log("reponse from aws:", data)
        })
    }

    getDataFromAws() {
        return fetch(`https://oz1ughjp59.execute-api.us-west-2.amazonaws.com/development/sessionId/${this.sessionId}/lastTime/${this.mostRecentGetTime}/getData`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json"
            }
        }).then((response) => {
            return response.json()
        }). then((data) => {
            console.log("Data from aws:", data.data)

            this.mostRecentGetTime = data.mostRecentTime > 0 ? data.mostRecentTime : this.mostRecentGetTime

            return data
        })
    }

    processData(data) {
        for (let userId in data.data) {
            store.processedData[userId] = store.processedData[userId] || {
                accelData: [],
                color: data.data[userId].color,
                senderSyncTime: data.data[userId].senderSyncTime
            }
            store.processedData[userId].accelData = store.processedData[userId].accelData.concat(data.data[userId].accelData)
        }
    }

    onSyncClick(letter) {
        let num = letter.charCodeAt(0)
        let offsetSeconds = (num - "A".charCodeAt(0) + 1) * cycleSeconds
        store.senderSyncTime = Date.now() - offsetSeconds * 1000
    }

    onColorChange(color) {
        console.log(color)
        store.color = color.hex
    }

    render() {
        let accelDataStr = ""
        let magStr = ""
        if (store.acceleration !== undefined && store.acceleration.x !== null) {
            accelDataStr = `X: ${store.acceleration.x.toFixed(1)} Y: ${store.acceleration.y.toFixed(1)} Z: ${store.acceleration.z.toFixed(1)}`
            magStr = `Mag: ${store.accelerationMagnitude.toFixed(1)}`
        }

        let syncButtonStyle = {
            display: store.senderSyncTime !== undefined ? "none" : "flex"
        }

        let colorPicker = store.senderSyncTime !== undefined ?
            <SwatchesPicker width="90vw" height="75vh" color={store.color} onChangeComplete={ (color) => this.onColorChange(color) } /> : null

        if (this.isSender) {
            return (
                <div className="mainContainer">
                    <div className="senderContainer">
                        <div>
                            Welcome to Jiggle Pants
                        </div>
                        <div>
                            Pressing button below to sync
                        </div>
                        <div>
                            {accelDataStr}
                        </div>
                        <div>
                            {magStr}
                        </div>
                        {colorPicker}
                        <div className="syncButtonContainer" style={syncButtonStyle}>
                            <button onClick={() => this.onSyncClick("A")}>A</button>
                            <button onClick={() => this.onSyncClick("B")}>B</button>
                            <button onClick={() => this.onSyncClick("C")}>C</button>
                            <button onClick={() => this.onSyncClick("D")}>D</button>
                        </div>
                    </div>
                </div>
            )
        } else {
            return (
                <div className="mainContainer">
                    <LineGraph />
                    <SyncView />
                </div>
            )
        }
    }
}

@MobxReact.observer class LineGraph extends React.Component {
    constructor() {
        super()

        this.graphWidth = 10
        this.graphHeight = 10

        this.lastGraphDrawTime = undefined
        this.lastDrawY = 20
        this.graphCycleCount = 0

        this.lastRenderData = {}

        setInterval(() => {
            let newCycleCount = Math.floor(store.graphTime / 100)
            if (newCycleCount !== this.graphCycleCount) {
                this.graphCycleCount = newCycleCount

                if (newCycleCount % 2 === 0) {
                    this.canvasContext1.clearRect(0, 0, this.graphWidth, this.graphHeight)
                } else {
                    this.canvasContext2.clearRect(0, 0, this.graphWidth, this.graphHeight)
                }
            }

            for (let userId in store.processedData) {
                let userData = store.processedData[userId]
                let cycleMs = cycleLoopCount * cycleSeconds * 1000
                let timeOffset = (userData.senderSyncTime - store.syncStartTime) % cycleMs
                timeOffset = timeOffset > Math.abs(cycleMs - timeOffset) ? timeOffset - cycleMs : timeOffset
                for (let timeData of userData.accelData) {
                    let lastData = this.lastRenderData[userId]
                    if (lastData !== undefined) {
                        let nPos = this.getNomalizedPosFromTimeAndMagData(timeData, timeOffset)
                        nPos.x = 80 - nPos.x

                        if (nPos.x > 0) {
                            let lastPos = this.getNomalizedPosFromTimeAndMagData(lastData, timeOffset)
                            lastPos.x = 80 - lastPos.x
                            this.drawLine(lastPos.x, lastPos.y, nPos.x, nPos.y, userData.color)
                        }
                    }

                    this.lastRenderData[userId] = timeData

                    //console.log("Time Data:", timeData)
                }
            }

            store.processedData = {}

            // let now = Date.now()
            // if (this.lastGraphDrawTime !== undefined) {

            //     let newY = 20 + 1.5 * store.accelerationMagnitude
            //     let lastOffsetX = (now - this.lastGraphDrawTime) / 1000 * store.graphScrollRate
            //     this.drawLine(80 - lastOffsetX, this.lastDrawY, 80, newY)

            //     this.lastDrawY = newY
            // }
            // this.lastGraphDrawTime = now
        }, 100)
    }

    componentDidMount() {
        this.graphWidth = this.graphRef.clientWidth
        this.graphHeight = this.graphRef.clientHeight

        this.forceUpdate()
    }

    getNomalizedPosFromTimeAndMagData(data, timeOffset) {
        let nX = (Date.now() - data.time - timeOffset) / 1000 * store.graphScrollRate
        let nY = 20 + 1.5 * data.magnitude

        return {
            x: nX,
            y: nY
        }
    }

    getCanvasPos(x, y) {
        let localGraphTime = store.graphTime % 100
        let flip1 = store.graphTime % 200 < 100
        let flip2 = x < localGraphTime
        let canvasContext = undefined
        let localX = 0
        if (flip1) {
            if (flip2) {
                canvasContext = this.canvasContext1
                localX = localGraphTime - x
            } else {
                canvasContext = this.canvasContext2
                localX = 100 + localGraphTime - x
            }
        } else if (flip2) {
            canvasContext = this.canvasContext2
            localX = localGraphTime - x
        } else {
            canvasContext = this.canvasContext1
            localX = 100 + localGraphTime - x
        }

        return {
            x: localX * this.graphWidth / 100,
            y: y / 100 * this.graphHeight,
            context: canvasContext
        }
    }

    drawLine(sX, sY, eX, eY, color) {
        let flip = sX < eX
        let x1 = flip ? eX : sX
        let y1 = flip ? eY : sY
        let x2 = flip ? sX : eX
        let y2 = flip ? sY : eY
        x1 = 100 - x1
        y1 = 100 - y1
        x2 = 100 - x2
        y2 = 100 - y2
        let start = this.getCanvasPos(x1, y1)
        let end = this.getCanvasPos(x2, y2)

        start.context.strokeStyle = color
        end.context.strokeStyle = color

        if (start.context === end.context) {
            start.context.beginPath()
            start.context.moveTo(start.x, start.y)
            start.context.lineTo(end.x, end.y)
            start.context.stroke()
        } else {
            let startStartX = start.x - (x2 - x1) / 100 * this.graphWidth
            start.context.beginPath()
            start.context.moveTo(startStartX, end.y)
            start.context.lineTo(start.x, start.y)
            start.context.stroke()

            let endEndX = (x2 - x1) / 100 * this.graphWidth + end.x
            end.context.beginPath()
            end.context.moveTo(end.x, end.y)
            end.context.lineTo(endEndX, start.y)
            end.context.stroke()
        }
    }

    render() {
        let canvas1Style = {
            left: `${-store.graphTime % 200 + 100}%`
        }
        let canvas2Style = {
            left: `${-(store.graphTime - 100) % 200 + 100}%`
        }

        return (
            <div className="lineGraph" ref={(newRef) => {
                this.graphRef = newRef
            }}>
                <canvas ref={(newRef) => {
                    this.canvasContext1 = newRef && newRef.getContext("2d")
                }} width={this.graphWidth} height={this.graphHeight} style={canvas1Style}/>
                <canvas ref={(newRef) => {
                    this.canvasContext2 = newRef && newRef.getContext("2d")
                }} width={this.graphWidth} height={this.graphHeight} style={canvas2Style}/>
            </div>
        )
    }
}

@MobxReact.observer class SyncView extends React.Component {
    constructor() {
        super()

        this.outText = "A"

        store.syncStartTime = Date.now()

        setInterval(() => {
            let time = (Date.now() - store.syncStartTime) / 1000
            let progress = time % cycleSeconds
            let cycleCount = Math.floor(time / cycleSeconds)

            let nextLetter = String.fromCharCode(65 + cycleCount % cycleLoopCount)
            this.outText = ""
            for (let i = 0; i < cycleSeconds; i += .5) {
                if (i < progress) {
                    this.outText += "-"
                } else {
                    this.outText += "_"
                }
            }
            this.outText += nextLetter
            this.forceUpdate()
        }, 33)
    }

    render() {
        return (
            <div className="syncContainer">
                {this.outText}
            </div>
        )
    }
}

ReactDOM.render(
    <Main />,
    document.getElementById("mount")
)
