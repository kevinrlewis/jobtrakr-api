module.exports = function(
  user_id,
  db
) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select delete_user(${user_id})',
    {
      user_id: user_id
    })
      // on successful insertion resolve promise
      .then(function(data) {
        resolve(data);
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('ERROR:', error);
        reject(Error(error));
      });
  });
}
