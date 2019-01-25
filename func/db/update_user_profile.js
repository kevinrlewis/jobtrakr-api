module.exports = function(
  user_id,
  email,
  first_name,
  last_name,
  bio,
  db
) {
  return new Promise(function(resolve, reject) {
    db.one('select update_user_profile(${user_id}, ${email}, ${first_name}, ${last_name}, ${bio})',
    {
      user_id: user_id,
      email: email,
      first_name: first_name,
      last_name: last_name,
      bio: bio
    })
      // on success resolve promise
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
