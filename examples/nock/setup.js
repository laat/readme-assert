import nock from 'nock';

nock('https://api.example.com')
  .get('/users/1')
  .reply(200, { id: 1, name: 'Alice' })
  .persist();
