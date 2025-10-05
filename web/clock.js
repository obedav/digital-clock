/*
 * Tablet desk clock
 *
 * Copyright (c) Project Nayuki
 * All rights reserved. Contact Nayuki for licensing.
 * https://www.nayuki.io/page/tablet-desk-clock
 */
"use strict";
var millis;
(function (millis) {
    millis.perSecond = 1000;
    millis.perMinute = 60 * millis.perSecond;
    millis.perHour = 60 * millis.perMinute;
    millis.perDay = 24 * millis.perHour;
})(millis || (millis = {}));
var util;
(function (util) {
    util.configPromise = doXhr("config.json", "json", millis.perMinute);
    function doXhr(url, type, timeout) {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.onload = () => resolve(xhr);
            xhr.ontimeout = () => reject("XHR timeout");
            xhr.onerror = () => reject("XHR error");
            xhr.open("GET", url, true);
            xhr.responseType = type;
            xhr.timeout = timeout;
            xhr.send();
        });
    }
    util.doXhr = doXhr;
    function getElem(id) {
        const result = document.getElementById(id);
        if (result instanceof HTMLElement)
            return result;
        throw "Assertion error";
    }
    util.getElem = getElem;
    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }
    util.sleep = sleep;
    async function sleepWithJitter(midpointMillis) {
        await sleep((0.9 + Math.random() * 0.2) * midpointMillis);
    }
    util.sleepWithJitter = sleepWithJitter;
})(util || (util = {}));
var clock;
(function (clock) {
    let prevUpdate = NaN; // In Unix seconds
    function main() {
        const d = time.correctedDate();
        const curUpdate = Math.floor(d.getTime() / millis.perSecond);
        if (curUpdate != prevUpdate) {
            prevUpdate = curUpdate;
            setText("clock-hour", twoDigits(d.getHours()));
            setText("clock-minute", twoDigits(d.getMinutes()));
            setText("clock-second", twoDigits(d.getSeconds()));
            setText("clock-date", // Local date: "2018-12-31-Mon"
            d.getFullYear() + EN_DASH + twoDigits(d.getMonth() + 1) + EN_DASH +
                twoDigits(d.getDate()) + EN_DASH + DAYS_OF_WEEK[d.getDay()]);
            setText("clock-utc", // UTC date/time: "01-Tue 17:49 UTC"
            twoDigits(d.getUTCDate()) + "-" + DAYS_OF_WEEK[d.getUTCDay()] + EN_SPACE +
                twoDigits(d.getUTCHours()) + ":" + twoDigits(d.getUTCMinutes()) + EN_SPACE + "UTC");
        }
        setTimeout(main, millis.perSecond - time.correctedDate().getTime() % millis.perSecond);
    }
    function setText(elemId, text) {
        let elem = util.getElem(elemId);
        if (elem.textContent != text)
            elem.textContent = text;
    }
    function twoDigits(x) {
        return x.toString().padStart(2, "0");
    }
    const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const EN_SPACE = "\u2002";
    const EN_DASH = "\u2013";
    setTimeout(main, 0);
})(clock || (clock = {}));
var time;
(function (time) {
    let timeCorrection = 0; // Milliseconds late
    function correctedDate() {
        return new Date(Date.now() + timeCorrection);
    }
    time.correctedDate = correctedDate;
    async function main() {
        const server = (await util.configPromise).response["time-server"];
        let imgElem = util.getElem("clock-status-no-time-sync");
        let consecutiveFailures = 0;
        while (true) {
            let sleepTime;
            try { // Update the time correction
                const remoteTime = (await util.doXhr("/time/" + server.join("/"), "json", 3 * millis.perSecond)).response;
                if (typeof remoteTime != "number")
                    throw "Invalid data";
                timeCorrection = remoteTime - Date.now();
                imgElem.style.display = "none";
                sleepTime = millis.perHour;
                consecutiveFailures = 0;
            }
            catch (e) {
                imgElem.style.removeProperty("display");
                // 10, 30, 100, 300, 1000, 3000 seconds
                sleepTime = Math.pow(10, (Math.min(consecutiveFailures, 5) + 8) / 2);
                consecutiveFailures++;
            }
            await util.sleepWithJitter(sleepTime);
        }
    }
    main();
})(time || (time = {}));
var wallpaper;
(function (wallpaper) {
    async function main() {
        while (true) {
            try {
                const url = (await util.doXhr("/wallpaper-daily.json", "json", 10 * millis.perSecond)).response;
                if (typeof url != "string")
                    throw "Invalid data";
                document.documentElement.style.backgroundImage =
                    `url('wallpaper/${encodeURIComponent(url)}')`;
            }
            catch (e) { }
            // Schedule next update at 05:00 local time
            const now = time.correctedDate();
            let next = new Date(now.getTime());
            next.setHours(5);
            next.setMinutes(0);
            next.setSeconds(0);
            next.setMilliseconds(0);
            while (next.getTime() <= now.getTime())
                next.setDate(next.getDate() + 1);
            await util.sleep(next.getTime() - now.getTime());
        }
    }
    main();
})(wallpaper || (wallpaper = {}));
var weather;
(function (weather) {
    weather.sunRiseSet = null; // 4-tuple in UTC
    let eraseWeatherTimeout = -1;
    async function main() {
        const url = (await util.configPromise).response["weather-canada-url"];
        if (!url)
            return; // Skip weather if URL is empty
        while (true) {
            updateWeather(url); // Don't wait
            // Schedule next update at 7~10 minutes past the hour
            const now = time.correctedDate();
            let next = new Date(now.getTime());
            next.setMinutes(7);
            next.setSeconds(0);
            next.setMilliseconds(Math.random() * 3 * millis.perMinute); // Jitter 3 minutes
            while (next.getTime() < now.getTime() + 1 * millis.perMinute)
                next.setTime(next.getTime() + millis.perHour);
            await util.sleep(next.getTime() - now.getTime());
        }
    }
    async function updateWeather(url) {
        if (eraseWeatherTimeout != -1)
            clearTimeout(eraseWeatherTimeout);
        eraseWeatherTimeout = setTimeout(eraseWeather, 30 * millis.perSecond);
        for (let i = 0; i < 5; i++) {
            try {
                await tryUpdateWeather(url);
                clearTimeout(eraseWeatherTimeout);
                eraseWeatherTimeout = -1;
                break;
            }
            catch (e) {
                await util.sleepWithJitter(Math.pow(4, i + 1) * millis.perSecond);
            }
        }
    }
    async function tryUpdateWeather(url) {
        const xhr = await util.doXhr("/proxy/" + encodeURIComponent(url), "document", 15 * millis.perSecond);
        if (xhr.status != 200)
            throw "Invalid status";
        let data = xhr.response;
        if (!(data instanceof Document))
            throw "Invalid type";
        function getText(selector) {
            const node = data.querySelector(selector);
            if (node === null)
                throw "Node missing";
            const text = node.textContent;
            if (text === null)
                throw "Text missing";
            return text;
        }
        util.getElem("clock-weather-description").textContent = getText("siteData > currentConditions > condition");
        const temperStr = getText("siteData > currentConditions > temperature");
        util.getElem("clock-weather-temperature").textContent = Math.round(parseFloat(temperStr)).toString().replace(/-/, MINUS) + " " + DEGREE + "C";
        weather.sunRiseSet = [
            "siteData > riseSet > dateTime[zone=UTC][name=sunrise] > hour",
            "siteData > riseSet > dateTime[zone=UTC][name=sunrise] > minute",
            "siteData > riseSet > dateTime[zone=UTC][name=sunset ] > hour",
            "siteData > riseSet > dateTime[zone=UTC][name=sunset ] > minute",
        ].map(q => parseInt(getText(q), 10));
        daylight.update();
    }
    function eraseWeather() {
        util.getElem("clock-weather-description").textContent = "";
        util.getElem("clock-weather-temperature").textContent = "";
        eraseWeatherTimeout = -1;
    }
    const DEGREE = "\u00B0";
    const MINUS = "\u2212";
    main();
})(weather || (weather = {}));
var daylight;
(function (daylight) {
    let svg = document.getElementById("clock-daylight");
    async function main() {
        while (true) {
            update();
            await util.sleep(millis.perMinute);
        }
    }
    function update() {
        // For the current whole day in the local time zone, calculate the key moments as linear UTC timestamps
        if (weather.sunRiseSet === null)
            return;
        const now = time.correctedDate();
        const dayStartTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 0).getTime();
        const dayEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
        let sunriseTime = Math.floor(dayStartTime / millis.perDay) * millis.perDay +
            weather.sunRiseSet[0] * millis.perHour + weather.sunRiseSet[1] * millis.perMinute;
        if (sunriseTime < dayStartTime)
            sunriseTime += millis.perDay;
        let sunsetTime = Math.floor(sunriseTime / millis.perDay) * millis.perDay +
            weather.sunRiseSet[2] * millis.perHour + weather.sunRiseSet[3] * millis.perMinute;
        if (sunsetTime < sunriseTime)
            sunsetTime += millis.perDay;
        const imgWidth = 10000;
        const imgHeight = 300;
        while (svg.firstChild !== null)
            svg.removeChild(svg.firstChild);
        svg.style.removeProperty("display");
        setAttr(svg, "viewBox", `0 ${-imgHeight / 2} ${imgWidth} ${imgHeight}`);
        // Draw day and night bars
        const scale = imgWidth / (dayEndTime - dayStartTime); // Image units per millisecond
        {
            function addBar(start, end, final, clazz) {
                const barHeight = 170;
                let path = addElem("path");
                let pathD = `M ${start} ${-barHeight / 2}`;
                pathD += ` H ${end}`;
                if (final)
                    pathD += ` v ${barHeight}`;
                else {
                    pathD += ` l 50 ${barHeight / 2}`;
                    pathD += ` l -50 ${barHeight / 2}`;
                }
                pathD += ` H ${start}`;
                pathD += ` z`;
                setAttr(path, "d", pathD);
                setAttr(path, "class", "bar " + clazz);
            }
            const sunrise = (sunriseTime - dayStartTime) * scale;
            const sunset = (sunsetTime - dayStartTime) * scale;
            addBar(0, sunrise, false, "night");
            addBar(sunrise, sunset, false, "day");
            addBar(sunset, imgWidth, true, "night");
        }
        function getDaylightClass(time) {
            return (sunriseTime <= time && time <= sunsetTime) ? "day" : "night";
        }
        // Draw hour tick marks
        for (let t = dayStartTime + millis.perHour; t < dayEndTime; t += millis.perHour) {
            const x = (t - dayStartTime) * scale;
            if (new Date(t).getHours() % 6 == 0) {
                const rectWidth = 70;
                const rectHeight = 135;
                const concavity = 40;
                let path = addElem("path");
                let pathD = `M ${x} 0`;
                pathD += ` m ${-rectWidth / 2} ${-rectHeight / 2}`;
                pathD += ` q ${concavity} ${rectHeight / 2} 0 ${rectHeight}`;
                pathD += ` h ${rectWidth}`;
                pathD += ` q ${-concavity} ${-rectHeight / 2} 0 ${-rectHeight}`;
                pathD += ` z`;
                setAttr(path, "d", pathD);
                setAttr(path, "class", "major-hour " + getDaylightClass(t));
            }
            else {
                const circRadius = 30;
                let circ = addElem("circle");
                setAttr(circ, "cx", x);
                setAttr(circ, "cy", 0);
                setAttr(circ, "r", circRadius);
                setAttr(circ, "class", "minor-hour " + getDaylightClass(t));
            }
        }
        // Draw current time arrow
        {
            const arrowWidth = 100;
            const arrowHeight = imgHeight;
            let path = addElem("path");
            let pathD = `M ${(now.getTime() - dayStartTime) * scale} 0`;
            pathD += ` m ${-arrowWidth / 2} ${-arrowHeight / 2}`;
            pathD += ` h ${arrowWidth}`;
            pathD += ` l ${-arrowWidth} ${arrowHeight}`;
            pathD += ` h ${arrowWidth}`;
            pathD += ` z`;
            setAttr(path, "d", pathD);
            setAttr(path, "class", "current-time " + getDaylightClass(now.getTime()));
        }
    }
    daylight.update = update;
    function addElem(tag) {
        return svg.appendChild(document.createElementNS(svg.namespaceURI, tag));
    }
    function setAttr(elem, key, val) {
        elem.setAttribute(key, val.toString());
    }
    main();
})(daylight || (daylight = {}));
var network;
(function (network) {
    async function main() {
        const config = (await util.configPromise).response;
        while (true) {
            updateInternetStatus(config["network-http-test-hosts"]); // Don't wait
            updateComputerStatuses(config["network-computer-tests"]);
            await util.sleepWithJitter(5 * millis.perMinute);
        }
    }
    async function updateInternetStatus(hosts) {
        let statusNoInternet = util.getElem("clock-status-no-internet");
        for (let i = 0; i < 3; i++) {
            let host = hosts[Math.floor(Math.random() * hosts.length)];
            try {
                let alive = (await util.doXhr(`/tcping/${host}/80`, "json", 10 * millis.perSecond)).response;
                if (typeof alive == "boolean" && alive) {
                    statusNoInternet.style.display = "none";
                    return;
                }
            }
            catch (e) { }
        }
        statusNoInternet.style.removeProperty("display");
    }
    function updateComputerStatuses(data) {
        for (const [type, hosts] of Object.entries(data)) {
            hosts.forEach(([host, port], index) => updateComputerStatus(type, index, host, port)); // Don't wait
        }
    }
    async function updateComputerStatus(type, index, host, port) {
        const id = `network-computer-${type}-${index}`;
        let img = document.getElementById(id);
        if (img === null) {
            let container = document.getElementById("clock-status-box");
            if (container === null)
                throw "Assertion error";
            img = container.appendChild(document.createElement("img"));
            img.src = `icon/network-computer-${type}.svg`;
            img.id = id;
            img.style.display = "none";
        }
        // Ignore exceptions because the caller isn't waiting
        let alive = (await util.doXhr(`/tcping/${host}/${port}`, "json", 10 * millis.perSecond)).response;
        if (typeof alive == "boolean" && alive)
            img.style.removeProperty("display");
        else
            img.style.display = "none";
    }
    main();
})(network || (network = {}));
