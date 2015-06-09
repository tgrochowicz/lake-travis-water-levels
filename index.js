var _ = require('lodash');
var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var NodeCache = require( "node-cache" );
var app = express();


var cache = new NodeCache();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));



app.all('/*', function(req, res, next) {
	// Opening this to the world for now, let's see what happens.
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	next();
});


app.get('/', function(request, response) {
	response.send('Server-side data retrieval for Lake Travis, TX');
});

app.get('/lakedata', function(request, response) {
	var body = cache.get('lakedata');
	response.send(body);
})

function dataFromColumn($row, column) {
	return parseFloat($row.find('td:nth-of-type(' + column + ')')
		.text()
		.replace(/[^\d.]/g, ''));
}

function insertData(data) {
	cache.set('lakedata', data);
}

var pingIntervalId;

function selfRefresh() {
	pingIntervalId = setInterval(function() {
		console.log('Refreshing data');
		retrieveData(insertData);
	}, 15 * 60 * 1000);
}

function retrieveData(callback) {
	request('http://hydromet.lcra.org/riverreport/report.aspx', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			$ = cheerio.load(body);

			var $dataRow = $('#GridView1 tr:nth-of-type(3)');
			
			var waterLevels = {};
			waterLevels.currentDepth = dataFromColumn($dataRow, 3);
			waterLevels.fullVolume = dataFromColumn($dataRow, 6);
			waterLevels.maxVolume = 1.072 * waterLevels.fullVolume;
			waterLevels.currentVolume = dataFromColumn($dataRow, 7);
			waterLevels.timestamp = new Date().toString();
			callback(waterLevels);	
		}
	})
}

retrieveData(insertData);

selfRefresh();

app.listen(app.get('port'), function() {
	console.log('Node app is running on port', app.get('port'));
});