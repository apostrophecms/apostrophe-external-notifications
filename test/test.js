const assert = require('assert');
const util = require('util');

function delay(ms) {
  return util.promisify(function(callback) {
    setTimeout(function() {
      return callback(null);
    }, ms);
  })();
}

describe('apostrophe-external-notifications', function() {

  let apos;

  this.timeout(20000);

  after(function(done) {
    require('apostrophe/test-lib/util').destroy(apos, done);
  });

  it('should be a property of the apos object', function(done) {
    apos = require('apostrophe')({
      testModule: true,

      modules: {
        'apostrophe-express': {
          port: 7900
        },
        'apostrophe-pages': {
          park: [],
          types: [
            {
              name: 'home',
              label: 'Home'
            },
            {
              name: 'testPage',
              label: 'Test Page'
            }
          ]
        },
        'products': {},
        'apostrophe-workflow': {
          alias: 'workflow',
          locales: [
            {
              name: 'default',
              label: 'Default',
              private: true,
              children: [
                {
                  name: 'fr'
                },
                {
                  name: 'us'
                },
                {
                  name: 'es'
                }
              ]
            }
          ]
        },
        'apostrophe-external-notifications': {
          alias: 'external',
          platforms: {
            slack: {
              channel: '#shared',
              events: {
                'apostrophe-workflow:afterExport': '#export',
                'apostrophe-workflow:afterForceExport': '#export'
              }
            }
          },
          construct: function(self, options) {
            // Mock out the slack transport so we can evaluate what was sent
            self.slack = function(req, options, channels, message) {
              self.seen = self.seen || [];
              self.seen.push({
                channels,
                message
              });
            };
          }
        }
      },
      afterInit: function(callback) {
        assert(apos.workflow);
        return callback(null);
      },
      afterListen: function(err) {
        assert(!err);
        done();
      }
    });
  });

  it('modify the home page, then commit, export and force export', function() {
    let home;
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(_home) {
      assert(_home);
      home = _home;
      home.title = 'Modified';
      return util.promisify(apos.pages.update)(req, home, {});
    }).then(function() {
      req.user.username = 'admin';
      req.user.title = 'Admin Person';
      return util.promisify(apos.workflow.commitLatest)(req, home._id);
    }).then(function(commitId) {
      return util.promisify(apos.workflow.export)(req, commitId, [ 'es', 'us' ]);
    }).then(function() {
      return util.promisify(apos.workflow.forceExport)(req, home._id, [ 'fr' ]);
    }).then(function() {
      // Allow time for the fact that external-notifications does not guarantee
      // instant delivery
      return delay(2000);
    }).then(function() {
      const seen = apos.external.seen;
      assert(seen[0].channels[0] === '#shared');
      assert(seen[0].channels.length === 1);
      assert(seen[0].message.formatted === 'Admin Person (admin) committed the page Modified in default');
      assert(seen[1].channels[0] === '#shared');
      assert(seen[1].channels[1] === '#export');
      assert(seen[1].channels.length === 2);
      assert(seen[1].message.formatted === 'Admin Person (admin) exported the page Modified from default to es, us');
      assert(seen[2].channels[0] === '#shared');
      assert(seen[2].channels[1] === '#export');
      assert(seen[2].channels.length === 2);
      assert(seen[2].message.formatted === 'Admin Person (admin) force-exported the page Modified from default to fr');
      assert(seen.length === 3);
    });
  });

  it('modify the home page, then force export a single widget', function() {
    apos.external.seen = [];
    let home;
    const req = apos.tasks.getReq({ locale: 'default-draft' });
    return apos.pages.find(req, { slug: '/' }).toObject().then(function(_home) {
      assert(_home);
      home = _home;
      home.homePageText = home.homePageText || { type: 'area', items: [] };
      home.homePageText.items.push({
        type: 'apostrophe-rich-text',
        content: '<h4>Hi Mom</h4>',
        _id: 'zotlkapow'
      });
      home.homePageText.items.push({
        type: 'apostrophe-rich-text',
        content: '<h4>Bye Mom</h4>',
        _id: 'fingerpippin'
      });
      return util.promisify(apos.pages.update)(req, home, {});
    }).then(function() {
      req.user.username = 'admin';
      req.user.title = 'Admin Person';
      return util.promisify(apos.workflow.forceExportWidget)(req, home._id, 'fingerpippin', [ 'fr' ]);
    }).then(function() {
      // Allow time for the fact that external-notifications does not guarantee
      // instant delivery
      return delay(2000);
    }).then(function() {
      const seen = apos.external.seen;
      assert(seen[0].channels[0] === '#shared');
      assert(seen[0].channels.length === 1);
      assert(seen[0].message.formatted === 'Admin Person (admin) force-exported a Rich Text widget on the page Modified from default to fr');
      assert(seen.length === 1);
    });
  });

});
