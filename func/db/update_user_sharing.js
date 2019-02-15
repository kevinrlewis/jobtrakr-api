module.exports = function(
  user_id,
  share_opportunities,
  share_applied,
  share_interviews,
  share_offers,
  is_private,
  db
) {
  return new Promise(function(resolve, reject) {
    db.one('select update_user_sharing(${user_id}, ${share_opportunities}, ${share_applied}, ${share_interviews}, ${share_offers}, $(is_private))',
    {
      user_id: user_id,
      share_opportunities: share_opportunities,
      share_applied: share_applied,
      share_interviews: share_interviews,
      share_offers: share_offers,
      is_private: is_private
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
