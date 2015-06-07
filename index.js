var express = require('express');
var pg = require('pg');
var request = require('request');
var jsdom = require('jsdom');
var NodeCache = require('node-cache');
var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.all('/*', function(req, res, next) {
	// Opening this to the world for now, let's see what happens.
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "X-Requested-With");
	next();
});

var lakeDataCache = new NodeCache( {
	stdTTL: 5 * 60,
	checkperiod: 5 * 60
});

app.get('/', function(request, response) {
	response.send('Server-side data retrieval for Lake Travis, TX');
});

app.get('/lakedata', function(request, response) {
	var lakedata = lakeDataCache.get('lakedata');
	if (lakedata) {
		response.send(lakedata);
	}
	else {
		pg.connect(process.env.DATABASE_URL, function(err, client, done) {
			if(err) {
				console.error(err);
				response.send(500);
			}
			client.query('select * from lakedata order by timestamp desc limit 1', function(err, result) {
				done();
				if (err || result.rows.length == 0) {
					// dunno
					console.error(err);
					retrieveData(insertData);
					response.send(500);
				}
				else {
					var newdata = result.rows[0];
					lakeDataCache.set('lakedata', newdata);
					response.send(newdata);
				}
			})
		})
	}
});

function dataFromColumn($row, column) {
	return parseFloat($row.find('td:nth-of-type(' + column + ')')
		.text()
		.replace(/[^\d.]/g, ''));
}

function insertData(data) {
	pg.connect(process.env.DATABASE_URL, function(err, client, done) {
		if(err) {
			console.error(err);
		}
		client.query('insert into lakedata values (now(), ' +
			data.currentDepth + ', ' +
			data.fullVolume + ', ' +
			data.currentVolume + ', ' +
			data.maxVolume + ')');
	})
}

var pingIntervalId;

function selfRefresh() {
	pingIntervalId = setInterval(function() {
		console.log('Refreshing data');
		retrieveData(insertData);
		selfRefresh();
	}, 15 * 60 * 1000);
}

function retrieveData(callback) {
	request('http://hydromet.lcra.org/riverreport/report.aspx', function (error, response, body) {
		if (!error && response.statusCode == 200) {
			jsdom.env(body, 
				["http://code.jquery.com/jquery.js"],
				function(errors, window) {
					var $dataRow = window.$('#GridView1 tr:nth-of-type(3)');
					var waterLevels = {};
					waterLevels.currentDepth = dataFromColumn($dataRow, 3);
					waterLevels.fullVolume = dataFromColumn($dataRow, 6);
					waterLevels.maxVolume = 1.072 * waterLevels.fullVolume;
					waterLevels.currentVolume = dataFromColumn($dataRow, 7);
					callback(waterLevels);	
				}
				)
		}
	})
}


app.get('/refresh', function(request, response) {
	retrieveData(insertData);
	response.send(200);
});

selfRefresh();

app.listen(app.get('port'), function() {
	console.log('Node app is running on port', app.get('port'));
});
