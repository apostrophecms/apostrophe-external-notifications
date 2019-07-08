# apostrophe-external-notifications

A simple way to get notifications via Slack and other external systems when various events occur in [ApostropheCMS](https://apostrophecms.org).

## Installation

```
# In the root dir of your existing apostrophe project
npm install apostrophe-external-notifications
```

## Configuration

```
// in app.js
  modules: {
    'apostrophe-external-notifications': {
      // OPTIONAL: an alias to make it easier to send your own notifications,
      // see example below
      alias: 'external',
      platforms: {
        slack: {
          apiKey: 'YOUR-slack-api-key-goes-here'
        }
      },
      events: {
        'apostrophe-workflow:afterCommit': {
          channels: [ '#apostrophe-edits' ]
        },
        'apostrophe-workflow:afterExport': {
          channels: [ '#apostrophe-edits' ]
        },
        'apostrophe-workflow:afterForceExport': {
          channels: [ '#apostrophe-edits' ]
        }
      }
    }
  }
```

## Limitations

There must be an Apostrophe promise event associated with what you want notifications for, and an external notification handler must be registered for that event. `apostrophe-external-notifications` has handlers for some popular cases, but not all.

## Adding support for more events

Here's how you would add support for the `afterCommit` event, if we didn't already have it. **This code assumes you gave the module an alias in your project,** as seen above.

```
self.on('apostrophe-workflow:afterCommit', 'notifyAfterCommit', (req, commit) => {
  self.apos.external.notify(req, '%u committed the %t %s.', commit.from, commit.from.title);
});
```

"What's going on in this code?" `apostrophe-workflow:afterCommit` is the event we want to listen for. `notifyAfterCommit` is a unique name for our promise event handler. `(req, commit)` are the arguments that the `afterCommit` event provides. `external.notify` accepts `req`, a template string, and arguments for the template string. The template string can contain the following optional placeholders:

* `%u` displays the current user's name, or falls back gracefully if there is no user. Powered by the `req` argument, so we do not need to pass anything else.
* `%t` displays the type of a document in a user-friendly way, or falls back to the `type` property. Expects a matching `doc` argument. (The `commit` object emitted by `afterCommit` has a `from` property containing the doc that was committed.)
* `%s` simply expects and sends a string argument. If it receives an array argument, it will send it as a comma-separated string.

> While you could do everything with `%s`, the `%u` and `%t` placeholders save time and prevent frequent causes of crashing bugs due to missing sanity checks.

**In a public npm module, you would NOT assume** that `apostrophe-external-notifactions` has a handy alias, and you would check whether it exists first. In that situation, access the module as:

```
self.apos.modules['apostrophe-external-notifications']
```

And make sure that value is not undefined.

## Adding support for more platforms

Support for Slack ships with this module by default. You can register handlers for other platforms.

Here is a simplified version of the Slack platform handler:

```
var rp = require('request-promise');
self.apos.externals.registerPlatform('slack', async function(req, channels, message) {
  for (const channel in channels) {
    await rp.post('https://slack.com/', {
      message,
      channel,
      apiKey: self.options.platforms.slack.apiKey
    });
  }
});
```

Note that in this case we don't use `req`. However another handler might want to make decisions based on the user's identity.

`channels` contains the array of channel names that you configured for the event.

`message` contains the message to be sent, as a string. Placeholders have already been resolved, the message is complete and ready to send.

> Although our platform handler function is `async` and `await`s each message, for the sake of performance `apostrophe-external-notifications` will not wait for each message to be completely sent before allowing the original Apostrophe event handler to return. However, for the sake of consistency the module does guarantee that notifications sent while handling a single web request will be delivered in order.

