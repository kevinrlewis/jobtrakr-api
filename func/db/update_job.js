module.exports = function(
  user_id,
  jobs_id,
  job_title,
  company_name,
  link,
  notes,
  attachments,
  db
) {
  return new Promise(function(resolve, reject) {
    db.one('select update_job(${user_id}, ${jobs_id}, ${job_title}, ${company_name}, ${link}, ${notes}, ${attachments})',
    {
      user_id: user_id,
      jobs_id: jobs_id,
      job_title: job_title,
      company_name: company_name,
      link: link,
      notes: notes,
      attachments: attachments
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
