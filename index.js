const rp = require('request-promise');

module.exports = {

  construct: function(self, options) {

    self.platforms = {};

    self.addPlatform = (name, fn) {
      self.platforms[name] = fn;
    };

    self.notifyOn = (event, fn) {

      self.on(event, 'notify' + self.apos.utils.capitalizeFirst(event), function() {
        const req = (args[0] && args[0].res && args[0].res.__) ? args[0] : null;
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
      self.runQueue();
    };

    self.sendOne = async (message) {
      for (const name of Object.keys(self.platforms)) {
        const platform = self.platforms[name];
        const channels = self.mapToChannels(name, message);
        await self.platforms[name](message.req, channels, message);
      }
    };

    self.mapToChannels = (platformName, message) => {
      const channels = [];
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
    };

    self.format = (req, template, ...args) {
      let output = '';
      const parts = template.split(/(%u|%s|$t)/);
      const i = 0;
      for (const part of parts) {
        if (part === '%u') {
          output += (req && req.user && req.user.username) || 'Anonymous';
        } else if (part === '%t') {
          if (i >= args.length) {
            output += 'Undefined';
          } else {
            output += (args[i] && (args[i].title || args[i].slug)) || 'Unknown';
            i++;
          }
        } else if (part === '%s') {
          if (i >= args.length) {
            output += 'Undefined';
          } else {
            output += args[i];
            i++;
          }
        } else {
          output += part;
        }
      }
      return output;
    };

    self.apos.externals.addPlatform('slack', async (req, channels, message) => {
      for (const channel of channels) {
        await rp.post('https://slack.com/', {
          message,
          channel,
          apiKey: self.options.platforms.slack.apiKey
        });
      }
    });

  }

};
