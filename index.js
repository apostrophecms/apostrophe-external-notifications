const rp = require('request-promise');

module.exports = {

  afterConstruct: function(self) {
    self.addStandardPlatforms();
    self.addStandardEventListeners();
  },

  construct: function(self, options) {

    self.platforms = {};

    self.addPlatform = function(name, fn) {
      self.platforms[name] = fn;
    };

    self.notifyOn = function(event, fn) {

      self.on(event, 'notify' + self.apos.utils.capitalizeFirst(event), function() {
        const req = (arguments[0] && arguments[0].res && arguments[0].res.__) ? arguments[0] : null;
        let formatArgs = fn.apply(null, arguments);
        const formatted = self.format(req, formatArgs[0], ...formatArgs.slice(1));
        let queue;
        if (req) {
          req.externalNotifyQueue = req.externalNotifyQueue || [];
          queue = req.externalNotifyQueue;
        } else {
          self.queue = self.queue || [];
          queue = self.queue;
        }
        queue.push({
          event,
          req,
          formatted
        });
        // Deliberately NOT awaited
        self.runQueue(queue);
      });

    };

    self.runQueue = async function(queue) {
      if (queue.sending) {
        return;
      }
      if (!queue.length) {
        return;
      }
      queue.sending = true;
      try {
        await self.sendOne(queue.shift());
      } catch (e) {
        // Consider retry, within reason, in future
        self.apos.utils.error(e);
      }
      queue.sending = false;
      // Deliberately NOT awaited
      self.runQueue(queue);
    };

    self.sendOne = async function(message) {
      for (const name of Object.keys(self.platforms)) {
        const options = self.options.platforms[name];
        if (!options) {
          continue;
        }
        const platform = self.platforms[name];
        let channels = self.mapToChannels(name, message);
        // Like _.uniq
        channels = [...new Set(channels)]; 
        await self.platforms[name](message.req, options, channels, message);
      }
    };

    self.mapToChannels = function(platformName, message) {
      let channels = [];
      const options = self.options.platforms[platformName];
      if (!options) {
        return channels;
      }
      if (options.channel) {
        channels = channels.concat(oneOrMore(options.channel));
      }
      if (options.events) {
        if (options.events[message.event]) {
          channels = channels.concat(oneOrMore(options.events[message.event]));
        }
      }
      return channels;

      function oneOrMore(a) {
        if (Array.isArray(a)) {
          return a;
        }
        return [ a ];
      }

    };

    self.format = function(req, template, ...args) {
      let output = '';
      const parts = template.split(/(\{(?:user|type|title|string)\})/);
      let i = 0;
      for (const part of parts) {
        if (part === '{user}') {
          const title = req && req.user && req.user.title;
          const username = (req && req.user && req.user.username) || 'Anonymous';
          const name = title ? `${title} (${username})` : username;
          output += name;
        } else if (part === '{type}') {
          if (i >= args.length) {
            output += 'Undefined';
          } else {
            const type = args[i] && args[i].type;
            if (!type) {
              output += 'Undefined';
            } else {
              if (type === 'apostrophe-global') {
                output += 'shared document';
              } else {
                const manager = self.apos.docs.getManager(type);
                if (manager && manager.options.label) {
                  output += manager.options.label;
                } else if (self.apos.pages.isPage(args[i])) {
                  output += 'page';
                } else {
                  output += type;
                }
              }
            }
            i++;
          }
        } else if (part === '{title}') {
          if (i >= args.length) {
            output += 'Undefined';
          } else {
            output += (args[i] && (args[i].title || args[i].slug)) || 'Unknown';
            i++;
          }
        } else if (part === '{string}') {
          if (i >= args.length) {
            output += 'Undefined';
          } else {
            if (Array.isArray(args[i])) {
              output += args[i].join(', ');
            } else {
              output += args[i];
            }
            i++;
          }
        } else {
          output += part;
        }
      }
      return output;
    };

    self.slack = async function(req, options, channels, message) {
      for (const channel of channels) {
        if (!options) {
          throw new Error('You must configure the slack platform when configuring the `apostrophe-external-notifications` module');
        }
        if (!(options.webhooks && options.webhooks[channel])) {
          throw new Error('You must configure the webhooks option for each channel used when configuring the `apostrophe-external-notifications` module for slack');
        }
        const args = {
          method: 'POST', 
          uri: options.webhooks[channel],
          json: true,
          body: {
            text: message.formatted
          }
        };
        await rp({
          method: 'POST', 
          uri: options.webhooks[channel],
          json: true,
          body: {
            text: message.formatted
          }
        });
      }
    };

    self.addStandardPlatforms = function() {
      self.addPlatform('slack', self.slack);
    };

    self.addStandardEventListeners = function() {
      self.notifyOn('apostrophe-workflow:afterCommit', (req, commit) => [
        '{user} committed the {type} {title} in {string}', commit.from, commit.from, liveify(commit.from.workflowLocale)
      ]);
      self.notifyOn('apostrophe-workflow:afterExport', (req, exported) => [
        '{user} exported the {type} {title} from {string} to {string}', exported.from, exported.from, liveify(exported.from.workflowLocale), liveify(exported.toLocales)
      ]);
      self.notifyOn('apostrophe-workflow:afterForceExport', (req, exported) => [
        '{user} force-exported the {type} {title} from {string} to {string}', exported.from, exported.from, liveify(exported.from.workflowLocale), liveify(exported.toLocales)
      ]);
      // Change en-draft to en, or [en-draft] to [en]
      function liveify(a) {
        const workflow = self.apos.modules['apostrophe-workflow'];
        if (!Array.isArray(a)) {
          return workflow.liveify(a);
        }
        return a.map(locale => workflow.liveify(locale));
      }
    };

  }

};
