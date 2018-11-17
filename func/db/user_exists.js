module.exports = function(email, db) {
  return new Promise(function(resolve, reject) {
    // check if user exists already
    db.one('select user_exists($1)', email)
      // on successful query
      .then(function(data) {
        // the user does not exist return false
        if(data.user_exists === null) {
          resolve({ result: false });
        // if the user does exist return true
        } else if(data.user_exists !== null) {
          resolve({ result: true });
        // if some other problem occurred reject and relay data
        } else {
          reject(data);
        }
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('ERROR:', error);
        reject(Error(error));
      });
  });
}
