var express = require('express');
var app = express();
var helmet = require('helmet');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var fs = require('fs');
var path = require('path');
var async = require('async');
var pgp = require('pg-promise')();
var multer = require('multer');
var multerS3 = require('multer-s3');
var config = require('./../db_config.json');
var sha256 = require('js-sha256');
var AWS = require('aws-sdk');
AWS.config.loadFromPath('./../aws_cred.json');
// var s3Cred = require('./../aws_cred.json');
var cn = {};

// database functions
var create_user = require('./func/db/create_user.js');
var login_user = require('./func/db/login_user.js');
var get_user = require('./func/db/get_user.js');
var get_user_by_id = require('./func/db/get_user_by_id.js');
var add_file = require('./func/db/add_file.js');
var add_job = require('./func/db/add_job.js');
var get_opportunities_by_user_id = require('./func/db/get_opportunities_by_user_id.js');
var get_jobs_by_user_id_and_job_type_id = require('./func/db/get_jobs_by_user_id_and_job_type_id.js');
var get_jobs_by_user_id = require('./func/db/get_jobs_by_user_id.js');
var update_job_type = require('./func/db/update_job_type.js');
var delete_file = require('./func/db/delete_file.js');

// helper functions
var is_valid_variable = require('./func/op/is_valid_variable.js');
var id_matches = require('./func/op/id_matches.js');

// globals
var jwtExp = 86400;
var port = 3000;
var logt = 'index';

const homedir = require('os').homedir();
const file_dir = homedir + '/.jt_api_files';
const profile_image_dir = homedir + '/.jt_api_profile_images';
const S3 = new AWS.S3();
const S3_FILE_BUCKET = 'jobtrak';

// var upload = multer({ dest: 'uploads/' });
var profile_image = multer({ dest: '.profile_images/' });
var upload = multer({
  storage: multerS3({
    s3: S3,
    bucket: S3_FILE_BUCKET,
    metadata: function(req, file, cb) {
      // console.log("metadata", file);
      cb(null, { fieldName: file.originalname });
    },
    key: function(req, file, cb) {
      console.log(file);
      console.log('sha256 s3 path: ', sha256('files/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
      cb(null, sha256('files/' + req.user.sub + "/" + Date.now().toString() + "/" + file.originalname));
    }
  })
});

// create file dir if it doesn't exist
if (!fs.existsSync(file_dir)){
  fs.mkdirSync(file_dir);
}

// create profile_image_dir if it doesn't exist
if (!fs.existsSync(profile_image_dir)){
  fs.mkdirSync(profile_image_dir);
}

app.use(helmet());
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true, parameterLimit: 1000000 }));
app.use(bodyParser.json({ limit: '50mb', extended: true }));
app.use(cookieParser());
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
const RSA_PUBLIC_KEY = fs.readFileSync('./../j2-jwtRS256.key.pub');

// middleware to check if the JWT in the cookie is correct for the user
const checkIfAuthenticated = expressJwt({
  secret: RSA_PUBLIC_KEY,
  algorithms: ['RS256'],
  getToken: function fromHeaderOrQueryString(req) {
    if (req.cookies && req.cookies.SESSIONID) {
      return req.cookies.SESSIONID;
    }
    return null;
  }
});

// base route, just prints hello world currently
// change to an api information page to display different api calls
router.get('/', asyncHandler ( (req, res, next) => res.send('Hello World!')) );

// login route to check user and return cookie if authenticated/exists
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

// signup route to create a user and return cookie to authenticate
// the user
router.post('/signup', asyncHandler( (req, res) => {
  // variables from body
  var email = req.body.email;
  var password = req.body.password;
  var firstname = req.body.firstname;
  var lastname = req.body.lastname;

  // TODO: change this to call is_valid_variable function
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
            console.log("DATA:", data);
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

// user route to get user information and display on the client
router.get('/user/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  // variables from params
  var id = parseInt(req.params.id);

  // check if any of the values are null or missing
  if(!is_valid_variable(id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to return user information
  } else {
    // call get_user db helper function
    get_user_by_id(id, db)
      .then(function(data) {
        console.log("DATA:", data);

        // store data from database that we want to return
        var dataDisplay = {
          user_id: data.get_user_by_id.user_id,
          email: data.get_user_by_id.email,
          firstname: data.get_user_by_id.first_name,
          lastname: data.get_user_by_id.last_name,
          share_opportunities: data.get_user_by_id.share_opportunities,
          share_applied: data.get_user_by_id.share_applied,
          share_interviews: data.get_user_by_id.share_interviews,
          share_offers: data.get_user_by_id.share_offers,
          profile_image: data.get_user_by_id.profile_image,
          bio: data.get_user_by_id.bio,
          create_datetime: data.get_user_by_id.create_datetime,
          update_datetime: data.get_user_by_id.update_datetime
        };

        // return status and message
        res.status(200).json({ message: 'Success.', data: dataDisplay });

      }, function(err) {
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

// upload route to save files from client and store their relevant information
// in the database
router.post('/upload', checkIfAuthenticated, upload.array('files', 10), asyncHandler( (req, res, next) => {
  console.log("FILES:", req.files);

  var filesArray = req.files;
  var type = req.body.type;

  if(!is_valid_variable(type)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  } else {
    // iterate files and perform operations on them
    // possibly move them to another location and delete them locally
    async.each(filesArray,
      function(file, next) {
        console.log("FILE: ", file);
        // call helper function, send db connection
        add_file(
          file.originalname,
          file.encoding,
          file.mimetype,
          file.key,
          file.location,
          file.size,
          type,
          db
        )
          // receive promise
          // on success return 200
          .then(function() {
            next(file.key);
          // on error then determine error
          }, function(err) {
            console.log(err);
            res.status(500).json({ message: 'Internal server error.' });
          });
      },
      // check if there was an error during the upload process
      function(filename, err) {
        console.log("FILENAME:", filename);
        if(err) {
          console.log("Error occurred in each", err);
          res.status(500).json({ message: 'Internal server error.' });
        } else {
          console.log("finished processing");
          res.status(200).json({ message: 'Files uploaded successfully.', file: filename });
        }
      }
    );
  }
}));

// upload profile image route to save profile images from client and store their
// relevant information in the database
router.post('/upload_profile_image', checkIfAuthenticated, profile_image.single('profile_image'), asyncHandler( (req, res, next) => {
  console.log("FILE:", req.file);

  // TODO: handle file, move to secure location
  // var file = IO.newFile("uploads/")

  // TODO: store file in database
}));

// endpoint to add a job
router.post('/job', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  console.log('/job body: ', req.body);

  var job_title = req.body.job_title;
  var company_name = req.body.company_name;
  var link = req.body.link;
  var notes = req.body.notes;
  var type = req.body.type;
  var attachments = req.body.attachments;
  var user_id = req.body.user_id;

  if(!is_valid_variable(job_title) || !is_valid_variable(company_name) || !is_valid_variable(link) ||
    !is_valid_variable(type) || !is_valid_variable(user_id)
    || (attachments === "" || attachments === undefined)) {
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  } else {
    console.log('/job type: ', type);
    add_job(job_title, company_name, link, notes, type, attachments, user_id, db)
      .then(function(data) {
        console.log("/job DATA:", data);
        // return status and message
        res.status(200).json({ message: 'Success.', data: data });
      }, function(err) {
        console.log("/job ERROR:", err);
        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }

}));

// get jobs for user by id
router.get('/job/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  // variables from body
  var id = parseInt(req.params.id);

  // check if any of the values are null or missing
  if(!is_valid_variable(id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to return opportunites tied to the user
  } else {
    // call db function to get all jobs by user id
    get_jobs_by_user_id(id, db)
      // on success
      .then(function(data) {
        console.log("/job/id/:id DATA:", data);

        // return status and message
        res.status(200).json({ message: 'Success.', data: data });
      // on failure
      }, function(err) {
        console.log("/job/id/:id ERROR:", err);

        // return status and message
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

// // get opportunities for user by id
// router.get('/job/opportunity/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
//   // constant type (opportunity 1)
//   const type_id = 1;
//
//   // variables from body
//   var id = parseInt(req.params.id);
//
//   // check if any of the values are null or missing
//   if(!is_valid_variable(id)) {
//     // if values are null then the request was bad
//     res.status(400).json({ message: 'Bad request.' });
//     return;
//   // check if parameter id matches the token id
//   } else if(!id_matches(id, req.cookies.SESSIONID)) {
//     res.status(401).json({ message: 'Unauthorized.' });
//     return;
//   // attempt to return opportunites tied to the user
//   } else {
//     // call db function to get all opportunities by user id
//     get_jobs_by_user_id_and_job_type_id(id, type_id, db)
//       // on success
//       .then(function(data) {
//         console.log("/job/opportunity/:id DATA:", data);
//
//         // return status and message
//         res.status(200).json({ message: 'Success.', data: data });
//       // on failure
//       }, function(err) {
//         console.log("/job/opportunity/:id ERROR:", err);
//
//         // return status and message
//         res.status(500).json({ message: 'Internal server error.' });
//       });
//   }
// }));
//
// // get applied for user by id
// router.get('/job/applied/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
//   // constant type (applied 2)
//   const type_id = 2;
//
//   // variables from body
//   var id = parseInt(req.params.id);
//
//   // check if any of the values are null or missing
//   if(!is_valid_variable(id)) {
//     // if values are null then the request was bad
//     res.status(400).json({ message: 'Bad request.' });
//     return;
//   // check if parameter id matches the token id
//   } else if(!id_matches(id, req.cookies.SESSIONID)) {
//     res.status(401).json({ message: 'Unauthorized.' });
//     return;
//   // attempt to return applied jobs tied to the user
//   } else {
//     // call db function to get all jobs by user id and type
//     get_jobs_by_user_id_and_job_type_id(id, type_id, db)
//       // on success
//       .then(function(data) {
//         console.log("/job/applied/:id DATA:", data);
//
//         // return status and message
//         res.status(200).json({ message: 'Success.', data: data });
//       // on failure
//       }, function(err) {
//         console.log("/job/applied/:id ERROR:", err);
//
//         // return status and message
//         res.status(500).json({ message: 'Internal server error.' });
//       });
//   }
// }));
//
// // get interviews for user by id
// router.get('/job/interview/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
//   // constant type (interview 3)
//   const type_id = 3;
//
//   // variables from body
//   var id = parseInt(req.params.id);
//
//   // check if any of the values are null or missing
//   if(!is_valid_variable(id)) {
//     // if values are null then the request was bad
//     res.status(400).json({ message: 'Bad request.' });
//     return;
//   // check if parameter id matches the token id
//   } else if(!id_matches(id, req.cookies.SESSIONID)) {
//     res.status(401).json({ message: 'Unauthorized.' });
//     return;
//   // attempt to return applied jobs tied to the user
//   } else {
//     // call db function to get all jobs by user id and type
//     get_jobs_by_user_id_and_job_type_id(id, type_id, db)
//       // on success
//       .then(function(data) {
//         console.log("/job/interview/:id DATA:", data);
//
//         // return status and message
//         res.status(200).json({ message: 'Success.', data: data });
//       // on failure
//       }, function(err) {
//         console.log("/job/interview/:id ERROR:", err);
//
//         // return status and message
//         res.status(500).json({ message: 'Internal server error.' });
//       });
//   }
// }));
//
// // get offers for user by id
// router.get('/job/offer/id/:id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
//   // constant type (offer 4)
//   const type_id = 4;
//
//   // variables from body
//   var id = parseInt(req.params.id);
//
//   // check if any of the values are null or missing
//   if(!is_valid_variable(id)) {
//     // if values are null then the request was bad
//     res.status(400).json({ message: 'Bad request.' });
//     return;
//   // check if parameter id matches the token id
//   } else if(!id_matches(id, req.cookies.SESSIONID)) {
//     res.status(401).json({ message: 'Unauthorized.' });
//     return;
//   // attempt to return applied jobs tied to the user
//   } else {
//     // call db function to get all jobs by user id and type
//     get_jobs_by_user_id_and_job_type_id(id, type_id, db)
//       // on success
//       .then(function(data) {
//         console.log("/job/offer/:id DATA:", data);
//
//         // return status and message
//         res.status(200).json({ message: 'Success.', data: data });
//       // on failure
//       }, function(err) {
//         console.log("/job/offer/:id ERROR:", err);
//
//         // return status and message
//         res.status(500).json({ message: 'Internal server error.' });
//       });
//   }
// }));

// update job for user under jobs_id where job_type is
router.post('/:id/job/:jobs_id/update/:job_type_id', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  console.log("PARAMS:", req.params);
  // variables from url
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.params.jobs_id);
  var job_type_id = parseInt(req.params.job_type_id);

  // check if any of the values are null or missing
  if(!is_valid_variable(user_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // check if parameter id matches the token id
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // attempt to update a job
  } else {
    // call db function
    update_job_type(user_id, jobs_id, job_type_id, db)
      .then(function(data) {
        console.log("/job/:id/update/:job_id/:job_type_id DATA:", data);
        res.status(200).json({ message: 'Success.' });
      }, function(err) {
        console.log("/job/:id/update/:job_id/:job_type_id ERROR:", err);
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/*
  delete a job
  body:
    required:
      - jobs_id
      - file_name
*/
router.post("/:id/delete/job", checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.body.jobs_id);
}));

/*
  delete a file
  body:
    required:
      - file_name
      - jobs_id
*/
router.post('/:id/delete/file', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  console.log('/:id/delete/file BODY:', req.body);
  var user_id = parseInt(req.params.id);
  var file_name = req.body.file_name;
  var jobs_id = parseInt(req.body.jobs_id);

  // check if any of the values are null or missing
  if(!is_valid_variable(user_id) || !is_valid_variable(file_name) || !is_valid_variable(jobs_id)) {
    // if values are null then the request was bad
    res.status(400).json({ message: 'Bad request.' });
    return;
  // validate the user
  } else if(!id_matches(user_id, req.cookies.SESSIONID)) {
    res.status(401).json({ message: 'Unauthorized.' });
    return;
  // all is well
  } else {
    var params = {
        Bucket: S3_FILE_BUCKET,
        Key: file_name
    };
    // call db function
    delete_file(file_name, jobs_id, db)
      // receive promise
      .then(function() {
        // delete file from s3 first
        S3.deleteObject(params, function(err, data) {
          // if there was an error deleting the s3 object then return 500
          if(err) {
            console.log('/:id/delete/file ERR:', err);
            res.status(500).json({ message: 'Internal server error.' });
            return;
          }

          // log success and return success
          console.log('/:id/delete/file S3 DATA: ', data);
          console.log('/:id/delete/file: FILE DELETED SUCCESSFULLY');
          res.status(200).json({ message: 'Success' });
        });
      // on error then determine error
      }, function(err) {
        console.log(err);
        res.status(500).json({ message: 'Internal server error.' });
      });
  }
}));

/**/
router.post('/:id/job/update', checkIfAuthenticated, asyncHandler( (req, res, next) => {
  var user_id = parseInt(req.params.id);
  var jobs_id = parseInt(req.body.jobs_id);
}));


// error handling
router.use(function (err, req, res, next) {
  console.log('-----------------------------------------------');
  // console.error("ERROR ROUTE:", err.stack);
  console.log(err);
  if(err.status === 401) {
    res.status(401).json('Unauthorized.');
    return;
  } else {
    res.status(500).json('Internal server error.');
    return;
  }
  console.log('-----------------------------------------------');
});

// missing routes
router.use(function (req, res, next) {
  console.log('-----------------------------------------------');
  console.log('404 route');
  console.log(req.url);
  console.log('-----------------------------------------------');
  res.status(404).json("Sorry can't find that!")
});

// prefix api
app.use('/api', router);

// listen to port
app.listen(port, () => console.log(`App listening on port ${port}!`));
