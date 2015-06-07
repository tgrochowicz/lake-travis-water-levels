var _ = require('lodash');
var express = require('express');
var request = require('request');
var cheerio = require('cheerio');
var AWS = require('aws-sdk');
var app = express();


app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

var AWS_ACCESS_KEY = process.env.AWS_ACCESS_KEY;
var AWS_SECRET_KEY = process.env.AWS_SECRET_KEY;
var S3_BUCKET = process.env.S3_BUCKET;

console.log(AWS_ACCESS_KEY, AWS_SECRET_KEY);
var s3_params = {
	Bucket: S3_BUCKET,
	Key: 'lakedata.json'
}
AWS.config.update({accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY});


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
	var s3 = new AWS.S3();
	s3.getObject(s3_params, function (err, data) {
		if (err) response.send(500).end();
		var body = JSON.parse(data.Body.toString());
		response.send(body);
	})
})

function dataFromColumn($row, column) {
	return parseFloat($row.find('td:nth-of-type(' + column + ')')
		.text()
		.replace(/[^\d.]/g, ''));
}

function insertData(data) {
	// replace file

	var file = _.extend({ Body: JSON.stringify(data) }, s3_params);
	
	var s3 = new AWS.S3();
	s3.upload(file, function (resp) {
		console.log(resp);
	})
	
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