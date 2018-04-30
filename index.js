/**
 * A Bot for Slack!
 */
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

/**
 * Define a function for initiating a conversation on installation
 * With custom integrations, we don't have a way to find out who installed us, so we can't message them :(
 */

function onInstallation(bot, installer) {
    if (installer) {
        bot.startPrivateConversation({user: installer}, function (err, convo) {
            if (err) {
                console.log(err);
            } else {
                convo.say('I am a bot that has just joined your team');
                convo.say('You must now /invite me to a channel so that I can be of use!');
            }
        });
    }
}


/**
 * Configure the persistence options
 */

var config = {};
if (process.env.MONGOLAB_URI) {
    var BotkitStorage = require('botkit-storage-mongo');
    config = {
        storage: BotkitStorage({mongoUri: process.env.MONGOLAB_URI}),
    };
} else {
    config = {
        json_file_store: ((process.env.TOKEN)?'./db_slack_bot_ci/':'./db_slack_bot_a/'), //use a different name if an app or CI
    };
}

/**
 * Are being run as an app or a custom integration? The initialization will differ, depending
 */
if (process.env.TOKEN || process.env.SLACK_TOKEN) {
    //Treat this as a custom integration
    var customIntegration = require('./lib/custom_integrations');
    var token = (process.env.TOKEN) ? process.env.TOKEN : process.env.SLACK_TOKEN;
    var controller = customIntegration.configure(token, config, onInstallation);
    console.log(process.env.PORT);
} else if (process.env.CLIENT_ID && process.env.CLIENT_SECRET && process.env.PORT) {
    //Treat this as an app
    var app = require('./lib/apps');
    var controller = app.configure(process.env.PORT, process.env.CLIENT_ID, process.env.CLIENT_SECRET, config, onInstallation);
} else {
    console.log('Error: If this is a custom integration, please specify TOKEN in the environment. If this is an app, please specify CLIENTID, CLIENTSECRET, and PORT in the environment');
    process.exit(1);
}


/**
 * A demonstration for how to handle websocket events. In this case, just log when we have and have not
 * been disconnected from the websocket. In the future, it would be super awesome to be able to specify
 * a reconnect policy, and do reconnections automatically. In the meantime, we aren't going to attempt reconnects,
 * WHICH IS A B0RKED WAY TO HANDLE BEING DISCONNECTED. So we need to fix this.
 *
 * TODO: fixed b0rked reconnect behavior
 */
// Handle events related to the websocket connection to Slack
controller.on('rtm_open', function (bot) {
    console.log('** The RTM api just connected!');
});

controller.on('rtm_close', function (bot) {
    console.log('** The RTM api just closed');
    // you may want to attempt to re-open
});

/**
 * Core bot logic goes here!
 */
// BEGIN EDITING HERE!

controller.on(
  'bot_channel_join', 
  function (bot, message) {
    bot.reply(message, "I'm here!")
  }
);

controller.hears(
  'hello',
  'direct_message', 
  function (bot, message) {
    bot.reply(message, 'Hello!');
  }
);

var bug_report_id = "bug_report";
var submit_report_id = "submit_report";

// Entry point for bug reporting
controller.hears(
  ['bug', 'error', 'problem', 'failure', 'fehler', 'report'], 
  ['direct_message', 'direct_mention'], 
  function(bot, message) {
		console.log('Someone is calling for help');
    var buttons = {
      attachments: [
        {
          title: 'Would you like to report a problem?',
          callback_id: bug_report_id,
          color: "#E88114",
          attachment_type: 'default',
          actions: [
            {
              "name": "yes",
              "text": "Yes",
              "value": "yes",
              "type": "button",
              "style": "primary"
            },
            {
              "name":"nope",
              "text": "Nop.",
              "value": "nop",
              "type": "button",
            }
          ]
        }
      ]
    };
	  console.log('buttons are constructed');
    bot.reply(message, buttons);
});

// receive an interactive message, and reply with a message that will replace the original
controller.on('interactive_message_callback', function(bot, message) {
  // check message.actions and message.callback_id to see what action to take...
  console.log('A button was pressed ${message.callback_id}');
  if (message.callback_id == bug_report_id) {
    // Remove message if 'no' was chosen
    if (message.actions[0].value == "nop") {
      bot.replyInteractive(message, {
        text: 'Must have resolved itself... or a refresh did the trick.' 
      })
    } else {
      var dialog = create_bug_dialog();
      bot.replyInteractive(message, {
        text: 'Problem is being filed.' 
      })
      bot.replyWithDialog(message, dialog.asObject());
    }
  } 
});


controller.on('dialog_submission', function(bot, message) {
  var submission = message.submission;
  bot.reply(message, 'Thanks for you help, the problem will be filed now!');

  // call dialogOk or else Slack will think this is an error
  bot.dialogOk();

  submit_bug_report(submission);
});


function submit_bug_report(submission) {
  // Builds the markup'ed description
  var description ='%0A%0A' + '%23%23 Environment' + '%0A%0A'+ encodeURI(submission.environment) + '%0A%0A' + '%23%23 Problem Description'+ '%0A%0A' + encodeURI(submission.problem)  + '%0A%0A' + '%23%23 Steps to reproduce' + '%0A%0A' + encodeURI(submission.reproduce);

  var label = null;
  switch (submission.severity) {
    case 'bug':
      label = 'Bug';
      break;
    case 'crit1':
      label = 'Critical Bug \ud83d\udc27';
      break;
    case 'crit2':
      label = 'Critical Bug \ud83d\udc27\ud83d\udc27';
      break;
    case 'crit3':
      label = 'Critical Bug \ud83d\udc27\ud83d\udc27\ud83d\udc27';
      break;
  };

  //var paramString = "title=" + encodeURI(submission.title) + "&description=" + encodeURI(description) + "&labels=" + encodeURI(label);
  var paramString = "title=" + encodeURI(submission.title) + "&labels=" + encodeURI(label) + "&description=" + description;
  var uri = 'https://gitlab.lana-labs.com/api/v4/projects/18/issues?' + paramString;
  console.log(uri);

	// construct an HTTP request
	var xhr = new XMLHttpRequest();
  xhr.open('POST', uri , true);
	//xhr.setRequestHeader('Content-Type', 'application/json; charset=UTF-8');
  xhr.setRequestHeader('PRIVATE-TOKEN', process.env.GITLAB_TOKEN);
  xhr.setRequestHeader("Content-type", "application/json; charset=utf-8");

	// send the collected data as JSON
	xhr.send(null);

  xhr.onreadystatechange = function() {
    if(xhr.readyState == 4 && xhr.status < 400) {
      console.log(JSON.parse(xhr.responseText).web_url);
    }  
  };
  return;
}


function create_bug_dialog() {
  var dialog = bot.createDialog(
    'Bug Report',
    'submit_report',
    'Submit'
  ) .addText('Title','title','', {placeholder: 'short description'})
    .addSelect('Select severity', 'severity', null, [
        {label: 'Annoying', value: 'bug'},
        {label: 'Survivable but sweat-inducing', value: 'crit1'},
        {label: 'It\'s bad, dude', value: 'crit2'},
        {label: 'OMG I\'m freaking out', value: 'crit3'}
      ],
      {placeholder: 'Select One'}
    )
    .addSelect('Select environment', 'environment', null, [
        {label:'Desktop',value:'desktop'},
        {label:'Academic Cloud',value:'academic_cloud'},
        {label:'Customer Cloud',value:'customer_cloud'},
        {label: 'Staging', value: 'staging' },
        {label: 'Developlment', value: 'master' }
      ],
      {placeholder: 'Select One'}
    )
    .addTextarea('Problem Description','problem', '', {
      placeholder: 'What happened?',
      max_length: 1000
    })
    .addTextarea('Steps to reproduce','reproduce', '', {
      placeholder: 'How Did you get here?',
      max_length: 1000
    })
  return dialog;
}



// Fallback state
controller.on(
  ['direct_message', 'mention', 'direct_mention'],
  function (bot, message) {
    bot.api.reactions.add({
      timestamp: message.ts,
      channel: message.channel,
      name: 'robot_face'
    }, function (err)  {
      if (err) {
        console.log(err)
      }
      bot.reply(message, 'Didn\'t quite understand that');
    });
  }
);
