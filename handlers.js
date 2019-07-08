  self.apos.modules

        properties: [ 'req.user.username', 'commit.from.type', 'commit.from.title' ],
        channel: '#apostrophe-edits'
      },
      'apostrophe-workflow:afterExport': {
        template: '%s exported the %s %s to these locales: [%s].',
        properties: [ 'req.user.username', 'commit.from.type', 'commit.from.title' ],
        channel: '#apostrophe-edits'
      },
      'apostrophe-workflow:afterForceExport': {
        template: '%s force-exported the %s %s to these locales: [%s].',
        channel: '#apostrophe-edits'
      },
  }
}
