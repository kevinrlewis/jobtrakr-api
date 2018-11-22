module.exports = function(id, db) {
  return new Promise(function(resolve, reject) {
    // run create user function
    db.one('select get_user_by_id(${id})',
    {
      id: id
    })
      // on successful insertion resolve promise
      .then(function(data) {
        resolve(data);
      })
      // on query error, reject and return error
      .catch(function(error) {
        console.log('SQL ERROR:', error);
        reject(Error(error));
      });
  });
}
