var express = require('express');
var app = express();
var port = 3000;
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');

app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// hold the routes
var router = express.Router();

router.get('/', (req, res) => res.send('Hello World!'));

// error handling
router.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).send('Something broke!')
});

// missing routes
router.use(function (req, res, next) {
  res.status(404).send("Sorry can't find that!")
});

// prefix api
app.use('/api', router);

app.listen(port, () => console.log(`App listening on port ${port}!`));
