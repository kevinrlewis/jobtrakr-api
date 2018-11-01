var express = require('express');
var app = express();
var port = 3000;
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jwt = require('jsonwebtoken');
var fs = require('fs');

app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// hold the routes
var router = express.Router();

const asyncHandler = fn => (req, res, next) =>
  Promise
    .resolve(fn(req, res, next))
    .catch(next);

const RSA_PRIVATE_KEY = fs.readFileSync('./../j-jwtRS256.key');

router.get('/', asyncHandler ( (req, res, next) => res.send('Hello World!')) );

router.post('/login', asyncHandler ( (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  if(validateUser()) {
    const userId = 1;

    const jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
      algorithm: 'RS256',
      expiresIn: 120,
      subject: userId
    });

    res.status(200).json({
      idToken: jwtBearerToken,
      expiresIn: 120
    });
  } else {
    res.status(401).send('Unauthorized');
  }

}));

router.post('signup', asyncHandler( (req, res) => {
  
}));

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
