const logt = 'index';
var express = require('express');
var app = express();
var port = 3000;
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jwt = require('jsonwebtoken');
var fs = require('fs');
var pgp = require('pg-promise')();
var config = require('./../db_config.json');
var cn = {};

// helper functions
var create_user = require('./func/create_user.js');
var login_user = require('./func/login_user.js');

app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

if(process.env.ENVIRONMENT != 'prod') {
  cn = {
    host: config.dev.host,
    port: config.dev.port,
    database: config.dev.database,
    user: config.dev.user,
    password: config.dev.password
  };
} else {
  cn = {
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password
  };
}

var db = pgp(cn);


// hold the routes
var router = express.Router();

const asyncHandler = fn => (req, res, next) =>
  Promise
    .resolve(fn(req, res, next))
    .catch(next);

try {
  const RSA_PRIVATE_KEY = fs.readFileSync('./../j-jwtRS256.key');
} catch(e) {
  console.log(logt, 'error reading key file...');
  // exit
}


router.get('/', asyncHandler ( (req, res, next) => res.send('Hello World!')) );

router.post('/login', asyncHandler ( (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  login_user(email, password, db)
    .then(function(data) {
      // if the user could not be validated
      if(data.validate_user === null) {
        console.log(logt, 'could not validate login');
        res.status(401);
        res.json({ message: 'Unauthorized' });
      // if the login_user returned user data
      } else if(data.validate_user !== null) {
        res.status(200);
        res.json({ message: 'User logged in.' });
      // if there was another reason the user could not login
      } else {
        console.log(logt, 'failed to validate login for another reason');
        res.status(500);
        res.json({ message: 'Internal server error.' });
      }
    // on login_user reject
    // cause: query_error, user_does_not_exist
    }, function(err) {
      console.log(logt, 'error:', err.message);
      if(err.message === 'user_does_not_exist') {
        res.status(404);
        res.json({ message: 'User does not exist.' });
      } else {
        res.status(500);
        res.json({ message: 'Internal server error.' });
      }
    })

  // if() {
  //   var userId = 1;
  //
  //   var jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
  //     algorithm: 'RS256',
  //     expiresIn: 120,
  //     subject: userId
  //   });
  //
  //   res.status(200).json({
  //     idToken: jwtBearerToken,
  //     expiresIn: 120
  //   });
  // } else {
  //   res.status(401).send('Unauthorized');
  // }

}));

router.post('/signup', asyncHandler( (req, res) => {
  // variables from body
  var email = req.body.email;
  var password = req.body.password;
  var firstname = req.body.firstname;
  var lastname = req.body.lastname;

  // check if any of the values are null or missing
  if(email == null || password == null || firstname == null || lastname == null) {
    // if values are null then the request was bad
    res.status(400);
    res.json({ message: 'Bad request.' });
  // if all of the values needed are there
  // attempt to create user
  } else {
    // call helper function, send db connection
    create_user(email, password, firstname, lastname, db)
      // receive promise
      // on success return 201 created
      .then(function() {
        res.status(201);
        res.json({ message: 'User created.' });
      // on error then determine error
      }, function(err) {
        // if the user already exists return 409 conflict code
        if(err.message === 'user_exists') {
          res.status(409);
          res.json({ message: 'User already exists.' });
        // other errors
        } else {
          res.status(500);
          res.json({ message: 'Internal server error.'});
        }
      });
  }

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
