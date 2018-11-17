var express = require('express');
var app = express();
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var fs = require('fs');
var pgp = require('pg-promise')();
var config = require('./../db_config.json');
var cn = {};

// helper functions
var create_user = require('./func/db/create_user.js');
var login_user = require('./func/db/login_user.js');
var get_user = require('./func/db/get_user.js');
var get_user_by_id = require('./func/db/get_user_by_id.js');

var is_valid_variable = require('./func/op/is_valid_variable.js');

// globals
var jwtExp = 604800;
var port = 3000;
var logt = 'index';

app.use(helmet());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// DEV ONLY
// app.use(function(req, res, next) {
//   res.header('Access-Control-Allow-Origin', req.headers.origin);
//   res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
//   next();
// });
// app.options("/*", function(req, res, next){
//   res.header('Access-Control-Allow-Origin', '*');
//   res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
//   res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With');
//   res.sendStatus(200);
// });

if(process.env.NODE_ENV != 'prod') {
  console.log('DEV DB CONFIG');
  cn = {
    host: config.dev.host,
    port: config.dev.port,
    database: config.dev.database,
    user: config.dev.user,
    password: config.dev.password
  };
} else {
  console.log('PROD DB CONFIG');
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

const RSA_PRIVATE_KEY = fs.readFileSync('./../j-jwtRS256.key');

const checkIfAuthenticated = expressJwt({
  secret: RSA_PRIVATE_KEY
});


router.get('/', asyncHandler ( (req, res, next) => res.send('Hello World!')) );

router.post('/login', asyncHandler ( (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  login_user(email, password, db)
    .then(function(data) {
      // if the user could not be validated
      if(data.validate_user === null) {
        console.log(logt, 'could not validate login');
        res.status(401).json({ message: 'Unauthorized' });
      // if the login_user returned user data
      } else if(data.validate_user !== null) {
        // console.log(data.validate_user.user_id);
        var user_id = data.validate_user.user_id;

        var jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
          algorithm: 'RS256',
          expiresIn: jwtExp,
          subject: user_id.toString()
        });

        // res.status(200).json({ data: jwtBearerToken });
        // cookie based storage
        res.cookie("SESSIONID", jwtBearerToken, {
            httpOnly:(process.env.NODE_ENV === 'prod' ? true : false),
            secure:(process.env.NODE_ENV === 'prod' ? true : false)
          })
          .status(200)
          .json({ message: 'OK', id: user_id });

      // if there was another reason the user could not login
      } else {
        console.log(logt, 'failed to validate login for another reason');
        res.status(500).json({ message: 'Internal server error.' });
      }
    // on login_user reject
    // cause: query_error, user_does_not_exist
    }, function(err) {
      console.log(logt, 'error:', err.message);
      if(err.message === 'user_does_not_exist') {
        res.status(404).json({ message: 'User does not exist.' });
      } else {
        res.status(500).json({ message: 'Internal server error.' });
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
    res.status(400).json({ message: 'Bad request.' });
  // if all of the values needed are there
  // attempt to create user
  } else {
    // call helper function, send db connection
    create_user(email, password, firstname, lastname, db)
      // receive promise
      // on success return 201 created
      .then(function() {
        // call helper function to get user info
        get_user(email, db)
          // retrieve user data from promise
          .then(function(data) {
            console.log(data);
            var jwtBearerToken = jwt.sign({}, RSA_PRIVATE_KEY, {
              algorithm: 'RS256',
              expiresIn: jwtExp,
              subject: data.get_user.user_id.toString()
            });

            var dataDisplay = {
              user_id: data.get_user.user_id,
              firstname: data.get_user.firstname,
              lastname: data.get_user.lastname
            };

            // console.log('environemnt: ', process.env.NODE_ENV);
            // console.log(process.env.NODE_ENV === 'prod' ? true : false);
            // set cookie for the response, return 201, and a message
            res.cookie("SESSIONID", jwtBearerToken, {
                httpOnly:(process.env.NODE_ENV === 'prod' ? true : false),
                secure:(process.env.NODE_ENV === 'prod' ? true : false)
              })
              .status(201)
              .json({ message: 'User created.', data: dataDisplay });
          // if helper function returns an error
          }, function(err) {
            console.log(err);
            res.status(500).json({ message: 'Internal server error.' });
          });
      // on error then determine error
      }, function(err) {
        // if the user already exists return 409 conflict code
        if(err.message === 'user_exists') {
          res.status(409).json({ message: 'User already exists.' });
        // other errors
        } else {
          res.status(500).json({ message: 'Internal server error.'});
        }
      });
  }
}));

router.get('/user/id/:id', asyncHandler( (req, res) => {
  // variables from body
  var id = parseInt(req.params.id);

  // check if any of the values are null or missing
  if(!is_valid_variable(id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
  // if all of the values needed are there
  // attempt to return user information
  } else {
    // call get_user db helper function
    get_user_by_id(id, db)
      .then(function(data) {
        console.log(data);

        // store data from database that we want to return
        var dataDisplay = {
          user_id: data.get_user_by_id.user_id,
          email: data.get_user_by_id.email,
          firstname: data.get_user_by_id.first_name,
          lastname: data.get_user_by_id.last_name
        };

        res.status(200).json({ message: 'Success.', data: dataDisplay });

      }, function(err) {
        console.log(err);
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

// error handling
router.use(function (err, req, res, next) {
  console.error(err.stack)
  res.status(500).json('Something broke!')
});

// missing routes
router.use(function (req, res, next) {
  console.log('404 route');
  res.status(404).json("Sorry can't find that!")
});

// prefix api
app.use('/api', router);

app.listen(port, () => console.log(`App listening on port ${port}!`));
