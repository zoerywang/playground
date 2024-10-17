const subwayFeeds = [
    { name: '123456S', endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs' },
    { name: 'ACEH', endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace' },
    { name: 'NQRW', endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw' },
    { name: 'BDFM', endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm' },
    { name: 'JZ', endpoint: 'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz' }
];

const financialDistrictStations = {
    '1': ['142', '139', '138', '137'], // Chambers St, Cortlandt St, Rector St, South Ferry
    '2': ['228', '229', '230'], // Park Place, Fulton St, Wall St
    '3': ['228', '229', '230'], // Park Place, Fulton St, Wall St
    '4': ['418', '419', '420'], // Brooklyn Bridge-City Hall, Fulton St, Wall St
    '5': ['418', '419', '420'], // Brooklyn Bridge-City Hall, Fulton St, Wall St
    '6': ['640', '418', '419', '420'], // Brooklyn Bridge-City Hall, Fulton St, Wall St
    'A': ['A32', 'A33', 'A34'], // Fulton St, Chambers St, World Trade Center
    'C': ['A32', 'A33', 'A34'], // Fulton St, Chambers St, World Trade Center
    'E': ['E01'], // World Trade Center
    'R': ['R23', 'R24', 'R25', 'R26'], // City Hall, Cortlandt St, Rector St, Whitehall St
    'W': ['R23', 'R24', 'R25', 'R26'], // City Hall, Cortlandt St, Rector St, Whitehall St
    'Z': ['630', '631', '632'], // Chambers St, Fulton St, Broad St
};

const stationNames = {
    '142': 'Chambers St',
    '139': 'Cortlandt St',
    '138': 'Rector St',
    '137': 'South Ferry',
    '228': 'Park Place',
    '229': 'Fulton St',
    '230': 'Wall St',
    '418': 'Brooklyn Bridge-City Hall',
    '419': 'Fulton St',
    '420': 'Wall St',
    '640': 'Brooklyn Bridge-City Hall',
    'A32': 'Fulton St',
    'A33': 'Chambers St',
    'A34': 'World Trade Center',
    'E01': 'World Trade Center',
    '630': 'Chambers St',
    '631': 'Fulton St',
    '632': 'Broad St',
    'R23': 'City Hall',
    'R24': 'Cortlandt St',
    'R25': 'Rector St',
    'R26': 'Whitehall St'
};

function getStationName(stopId) {
    const baseStopId = stopId.replace(/[NS]$/, '');
    return stationNames[baseStopId] || stopId;
}

function getDirection(stopId) {
    return stopId.endsWith('N') ? 'Uptown' : 'Downtown';
}

let gtfsRealtimeSchema;

function loadProtobufSchema() {
    const url = "gtfs-realtime-schema.txt";
    console.log("Loading protobuf schema from:", url);
    return new Promise((resolve, reject) => {
        fetch(url)
            .then(response => response.text())
            .then(schemaText => {
                protobuf.parse(schemaText, (err, root) => {
                    if (err) {
                        console.error("Error parsing protobuf schema:", err);
                        reject(err);
                    } else {
                        console.log("Protobuf schema loaded and parsed successfully");
                        gtfsRealtimeSchema = root;
                        resolve();
                    }
                });
            })
            .catch(error => {
                console.error("Error fetching protobuf schema:", error);
                reject(error);
            });
    });
}

async function getSubwaySchedule() {
    const subwayScheduleDiv = document.getElementById('subway-schedule');
    subwayScheduleDiv.innerHTML = 'Loading subway schedule...';

    try {
        if (!gtfsRealtimeSchema) {
            await loadProtobufSchema();
        }

        let allArrivals = [];
        for (const feed of subwayFeeds) {
            try {
                const arrivals = await fetchAndParseFeed(feed.endpoint);
                allArrivals = allArrivals.concat(arrivals);
            } catch (error) {
                console.error(`Error fetching data for ${feed.name}:`, error);
            }
        }

        if (allArrivals.length === 0) {
            subwayScheduleDiv.innerHTML = 'No upcoming arrivals found for Financial District stations.';
            return;
        }

        const arrivalsByLine = allArrivals.reduce((acc, arrival) => {
            const group = getLineGroup(arrival.lineName);
            if (!acc[group]) {
                acc[group] = {};
            }
            if (!acc[group][arrival.lineName]) {
                acc[group][arrival.lineName] = [];
            }
            acc[group][arrival.lineName].push(arrival);
            return acc;
        }, {});

        const sortedGroups = Object.entries(arrivalsByLine).sort(([groupA], [groupB]) => groupA.localeCompare(groupB));

        let scheduleHtml = '';
        sortedGroups.forEach(([group, lines]) => {
            scheduleHtml += `<div class="subway-group">`;
            
            // Add icons for each line in the group
            scheduleHtml += `<h3 class="group-header">`;
            group.split('').forEach(line => {
                scheduleHtml += getLineSVG(line);
            });
            scheduleHtml += `</h3>`;

            scheduleHtml += `<ul class="subway-list">`;
            
            Object.entries(lines).forEach(([lineName, arrivals]) => {
                arrivals.slice(0, 2).forEach(arrival => {
                    const arrivalTimeString = arrival.arrivalTime 
                        ? arrival.arrivalTime.toLocaleTimeString()
                        : 'Time not available';
                    const stationName = getStationName(arrival.stopId);
                    const direction = getDirection(arrival.stopId);
                    scheduleHtml += `
                        <li class="subway-item">
                            <span class="subway-info">${direction} arriving at ${stationName} at ${arrivalTimeString}</span>
                        </li>`;
                });
            });
            scheduleHtml += '</ul></div>';
        });

        subwayScheduleDiv.innerHTML = scheduleHtml;
    } catch (error) {
        subwayScheduleDiv.innerHTML = 'Error loading subway schedule. Please try again later.';
        console.error('Error fetching subway schedule:', error);
    }
}

async function fetchAndParseFeed(endpoint) {
    const response = await fetch(endpoint);
    const arrayBuffer = await response.arrayBuffer();
    
    const firstBytes = new Uint8Array(arrayBuffer.slice(0, 16));

    if (firstBytes[0] === 0x3c && firstBytes[1] === 0x3f && firstBytes[2] === 0x78) {
        const text = new TextDecoder().decode(arrayBuffer);
        return parseXmlData(text);
    } else {
        return parseProtobufData(arrayBuffer);
    }
}

async function parseProtobufData(arrayBuffer) {
    if (!gtfsRealtimeSchema) {
        throw new Error("Protobuf schema not loaded");
    }

    const FeedMessage = gtfsRealtimeSchema.lookupType("transit_realtime.FeedMessage");
    const message = FeedMessage.decode(new Uint8Array(arrayBuffer));
    const decodedMessage = FeedMessage.toObject(message);

    return extractArrivals(decodedMessage);
}

function parseXmlData(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    if (xmlDoc.getElementsByTagName('Error').length > 0) {
        console.error("Error in XML feed:", xmlText);
        return [];
    }

    const entities = xmlDoc.getElementsByTagName('entity');
    let fidiArrivals = [];

    for (let entity of entities) {
        const tripUpdate = entity.getElementsByTagName('trip_update')[0];
        if (!tripUpdate) continue;

        const tripId = tripUpdate.getElementsByTagName('trip_id')[0]?.textContent;
        const routeId = tripUpdate.getElementsByTagName('route_id')[0]?.textContent;
        const stopTimeUpdates = tripUpdate.getElementsByTagName('stop_time_update');

        for (let stopTimeUpdate of stopTimeUpdates) {
            const stopId = stopTimeUpdate.getElementsByTagName('stop_id')[0]?.textContent;
            if (!financialDistrictStations[routeId]?.includes(stopId)) continue;

            const arrivalTime = stopTimeUpdate.getElementsByTagName('arrival')[0]?.getElementsByTagName('time')[0]?.textContent;
            if (!arrivalTime) continue;

            fidiArrivals.push({
                tripId: tripId,
                lineName: routeId,
                stopId: stopId,
                arrivalTime: new Date(parseInt(arrivalTime) * 1000)
            });
        }
    }

    return fidiArrivals;
}

function extractArrivals(feedMessage) {
    let arrivals = [];

    for (const entity of feedMessage.entity) {
        if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
            const routeId = entity.tripUpdate.trip.routeId;

            for (const update of entity.tripUpdate.stopTimeUpdate) {
                const baseStopId = update.stopId.replace(/[NS]$/, '');
                if (financialDistrictStations[routeId] && financialDistrictStations[routeId].includes(baseStopId)) {
                    const arrivalTime = update.arrival ? new Date(update.arrival.time * 1000) : null;
                    const departureTime = update.departure ? new Date(update.departure.time * 1000) : null;
                    arrivals.push({
                        lineName: routeId,
                        stopId: update.stopId,
                        arrivalTime: arrivalTime,
                        departureTime: departureTime
                    });
                }
            }
        }
    }

    return arrivals;
}

function getLineGroup(lineName) {
    if (['1', '2', '3'].includes(lineName)) return '123';
    if (['4', '5', '6'].includes(lineName)) return '456';
    if (['A', 'C', 'E'].includes(lineName)) return 'ACE';
    if (['N', 'Q', 'R', 'W'].includes(lineName)) return 'NQRW';
    if (['B', 'D', 'F', 'M'].includes(lineName)) return 'BDFM';
    if (['J', 'Z'].includes(lineName)) return 'JZ';
    return lineName;
}

function getLineSVG(line) {
    const colors = {
        '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
        '4': '#00933C', '5': '#00933C', '6': '#00933C',
        'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
        'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
        'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
        'G': '#6CBE45', 'J': '#996633', 'Z': '#996633', 'L': '#A7A9AC',
        '7': '#B933AD', 'S': '#808183'
    };
    const color = colors[line] || '#000000';
    return `
        <svg class="subway-icon" width="30" height="30" viewBox="0 0 30 30">
            <circle cx="15" cy="15" r="15" fill="${color}"/>
            <text x="15" y="20" font-size="16" fill="white" text-anchor="middle">${line}</text>
        </svg>
    `;
}

function updatePageTitle() {
    const pageTitleElement = document.getElementById('page-title');
    if (pageTitleElement) {
        pageTitleElement.textContent = "Zoe's Cheat Sheet";
    } else {
        console.warn("Element with id 'page-title' not found");
    }
    document.title = "Zoe's Cheat Sheet";
}

function initializeApp() {
    updatePageTitle();
    getSubwaySchedule();
    getWeatherData();
    getFunFact();  // Added this line
    // Set up automatic updates
    setInterval(getSubwaySchedule, 60000);
    setInterval(getWeatherData, 1800000);
    setInterval(getFunFact, 86400000);  // Added this line

    const updateButton = document.getElementById('update-schedule');
    if (updateButton) {
        updateButton.addEventListener('click', function() {
            getSubwaySchedule();
        });
    }
}

// Make sure this is at the end of your script.js file
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

async function getWeatherData() {
    const lat = 40.7128;
    const lon = -74.0060;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,weathercode&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset&current_weather=true&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_hours=24`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        displayWeather(data);
    } catch (error) {
        console.error('Error fetching weather data:', error);
    }
}

function displayWeather(data) {
    const weatherDiv = document.getElementById('weather-info');
    const current = data.current_weather;
    const daily = data.daily;
    const hourly = data.hourly;

    if (!current || !daily || !hourly) {
        weatherDiv.innerHTML = 'Weather data is incomplete. Please try again later.';
        return;
    }

    const now = new Date();
    const sunrise = new Date(daily.sunrise[0]);
    const sunset = new Date(daily.sunset[0]);
    const isDaytime = isDay(now, sunrise, sunset);

    setWeatherBackground(current.weathercode, isDaytime);

    let html = `
        <div class="weather-main">
            <h2>New York City</h2>
            <div class="weather-current">
                <span class="temperature">${Math.round(current.temperature)}°</span>
                <span class="weather-icon">${getWeatherIcon(current.weathercode, isDaytime)}</span>
            </div>
            <p class="weather-description">${getWeatherDescription(current.weathercode)}</p>
            <p class="high-low">H:${Math.round(daily.temperature_2m_max[0])}° L:${Math.round(daily.temperature_2m_min[0])}°</p>
        </div>
        <div class="weather-hourly">
    `;

    const currentHourIndex = hourly.time.findIndex(time => new Date(time).getHours() === now.getHours());
    for (let i = currentHourIndex; i < currentHourIndex + 24 && i < hourly.time.length; i++) {
        const forecastTime = new Date(hourly.time[i]);
        const forecastHour = forecastTime.getHours();
        const temp = Math.round(hourly.temperature_2m[i]);
        const isHourDay = isDay(forecastTime, sunrise, sunset);
        
        html += `
            <div class="hourly-item">
                <span class="hour">${forecastHour === now.getHours() ? 'Now' : (forecastHour % 12 || 12) + (forecastHour >= 12 ? 'PM' : 'AM')}</span>
                <span class="icon">${getWeatherIcon(hourly.weathercode[i], isHourDay)}</span>
                <span class="temp">${temp}°</span>
            </div>
        `;
    }

    html += '</div>';
    weatherDiv.innerHTML = html;
}

function setWeatherBackground(weatherCode, isDay) {
    const weatherDiv = document.getElementById('weather-info');
    let gradient;

    if (isDay) {
        gradient = `
            linear-gradient(
                to bottom,
                #87CEEB 0%,
                #B0E0E6 50%,
                #87CEFA 100%
            )
        `;
        weatherDiv.style.background = gradient;
        weatherDiv.style.backgroundSize = '100% 100%';
    } else {
        // Night sky with more visible stars
        gradient = `
            linear-gradient(
                to bottom,
                #0C1445 0%,
                #1E2B6D 50%,
                #3B4F91 100%
            )
        `;
        weatherDiv.style.background = gradient;
        weatherDiv.style.backgroundSize = '100% 100%';
        
        // Add stars
        const stars = `
            radial-gradient(1px 1px at 10px 10px, white, rgba(255,255,255,0)),
            radial-gradient(1px 1px at 150px 150px, white, rgba(255,255,255,0)),
            radial-gradient(1px 1px at 70px 170px, white, rgba(255,255,255,0)),
            radial-gradient(2px 2px at 120px 50px, white, rgba(255,255,255,0)),
            radial-gradient(2px 2px at 30px 100px, white, rgba(255,255,255,0)),
            radial-gradient(2px 2px at 180px 80px, white, rgba(255,255,255,0)),
            radial-gradient(2px 2px at 200px 200px, white, rgba(255,255,255,0))
        `;
        weatherDiv.style.backgroundImage = `${stars}, ${gradient}`;
        weatherDiv.style.backgroundSize = '200px 200px, 100% 100%';
        weatherDiv.style.backgroundRepeat = 'repeat, no-repeat';
    }

    weatherDiv.style.color = isDay ? '#333' : '#fff';

    // Ensure the "New York City" text is always white
    const cityText = document.querySelector('.weather-main h2');
    if (cityText) {
        cityText.style.color = 'white';
    }
}

function isDay(time, sunrise, sunset) {
    return time > sunrise && time < sunset;
}

function getWeatherIcon(weatherCode, isDay) {
    const weatherIcons = {
        0: ['☀️', '🌙'], 1: ['🌤️', '🌙'], 2: ['⛅', '☁️'], 3: ['☁️', '☁️'], 
        45: ['🌫️', '🌫️'], 48: ['🌫️', '🌫️'],
        51: ['🌦️', '🌧️'], 53: ['🌦️', '🌧️'], 55: ['🌧️', '🌧️'], 
        61: ['🌧️', '🌧️'], 63: ['🌧️', '🌧️'], 65: ['🌧️', '🌧️'],
        71: ['🌨️', '🌨️'], 73: ['🌨️', '🌨️'], 75: ['🌨️', '🌨️'], 
        95: ['⛈️', '⛈️'], 96: ['⛈️', '⛈️'], 99: ['⛈️', '⛈️']
    };
    const icons = weatherIcons[weatherCode] || ['❓', '❓'];
    return isDay ? icons[0] : icons[1];
}

function getWeatherDescription(weatherCode) {
    const descriptions = {
        0: 'Clear sky',
        1: 'Mainly clear',
        2: 'Partly cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Depositing rime fog',
        51: 'Light drizzle',
        53: 'Moderate drizzle',
        55: 'Dense drizzle',
        61: 'Slight rain',
        63: 'Moderate rain',
        65: 'Heavy rain',
        71: 'Slight snow fall',
        73: 'Moderate snow fall',
        75: 'Heavy snow fall',
        95: 'Thunderstorm',
        96: 'Thunderstorm with slight hail',
        99: 'Thunderstorm with heavy hail'
    };
    return descriptions[weatherCode] || 'Unknown';
}

window.onload = getWeatherData;

async function getFunFact() {
    const funFactDiv = document.getElementById('fun-fact-content');
    try {
        const response = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await response.json();
        funFactDiv.innerHTML = `<p>${data.text}</p>`;
    } catch (error) {
        console.error('Error fetching fun fact:', error);
        funFactDiv.innerHTML = '<p>Failed to load fun fact. Please try again later.</p>';
    }
}

function displaySubwaySchedule(schedule) {
    const subwayScheduleDiv = document.getElementById('subway-schedule');
    let html = '';

    for (const line in schedule) {
        html += `
            <div class="subway-line">
                <h3>
                    <img src="path/to/${line}-train-icon.svg" alt="${line} Train" class="subway-icon">
                    Train
                </h3>
                <ul>
        `;

        schedule[line].forEach(train => {
            html += `<li>${train.direction} - ${train.time}</li>`;
        });

        html += `
                </ul>
            </div>
        `;
    }

    subwayScheduleDiv.innerHTML = html;
}
