#!/usr/bin/env python

import re
import os
import hmac
import hashlib
import urllib
import urllib2
from base64 import b64encode
from datetime import datetime
from fnmatch import fnmatch
from optparse import OptionParser

# Swag at max content that can fit in a Blob
MAX_FILE_SIZE = 1024 * 1024 - 200

try:
    try:
        import json  # Python 2.6
    except ImportError:
        from django.utils import simplejson as json  # Django
except ImportError:
    import simplejson as json  # Please easy_install simplejson

ADMIN = 'admin'
META_FILENAME = 'app.json'
OPTIONS_FILENAME = '.pf'
ERROR_FILENAME = 'pferror.html'
IGNORE_FILENAMES = ('pf.py', ERROR_FILENAME, '.*', '*~', '#*#',
                    '*.bak', '*.rej', '*.orig')
commands = None
APP_REGEX = re.compile(r'\s*"application":\s*\"([a-z0-9-]+)"')


def intcomma(value):
    orig = str(value)
    while True:
        new = re.sub("^(-?\d+)(\d{3})", '\g<1>,\g<2>', orig)
        if orig == new:
            return new
        orig = new


def as_datetime(dct):
    """
    Decode datetime objects from JSON dictionary.
    """
    if dct.get('__class__', '') == 'Date' and 'isoformat' in dct:
        isoformat = dct['isoformat'][:19]
        return datetime.strptime(isoformat, '%Y-%m-%dT%H:%M:%S')
    return dct


class ModelEncoder(json.JSONEncoder):
    """
    Encode Date objects to JSON.
    """
    def default(self, obj):
        if isinstance(obj, datetime):
            return {"__class__": "Date",
                    "isoformat": obj.isoformat() + 'Z'}
        return json.JSONEncoder.default(self, obj)


class AuthRequest(urllib2.Request):
    """HTTP request with sessionkey cookie and referer."""

    def __init__(self, url, *args, **kwargs):
        urllib2.Request.__init__(self, url, *args, **kwargs)
        self.add_header('Referer', 'http://%s.%s/' % (
                options.application, options.server))
        if (hasattr(options, 'session_key')):
            self.add_header('Cookie', 'sessionkey=' + options.session_key)
        if options.verbose:
            print "HTTP %s %s" % (self.get_method(), url)


class PutRequest(AuthRequest):
    """Request to upload a file with HTTP PUT."""

    def get_method(self):
        return 'PUT'


class DeleteRequest(AuthRequest):
    """Request to remove a file with HTTP DELETE."""

    def get_method(self):
        return 'DELETE'


def hmac_sha1(key, message):
    # Convert unicode strings to byte strings - hmac will throw type error
    key = str(key)
    message = str(message)
    return hmac.new(key, message, hashlib.sha1).hexdigest()


def sign_in():
    url = options.root_url + 'auth/challenge'
    challenge = urllib2.urlopen(AuthRequest(url)).read()
    if options.verbose:
        print "Challenge: %s" % challenge
    signature = hmac_sha1(options.secret, challenge)
    reply = '|'.join((options.username, challenge, signature))
    url = options.root_url + 'auth/verify/' + reply
    if options.verbose:
        print "Response: %s" % url
    session_key = urllib2.urlopen(AuthRequest(url)).read()
    if options.verbose:
        print "Session key: %s" % session_key
    return session_key


def load_application():
    """
    Load application from META_FILENAME, or ask the user for it.
    """
    if options.local_only:
        return

    if options.command == 'test':
        options.application = 'pfpytest'
        options.save_app = False

    if options.command == 'listapps':
        options.application = 'www'
        options.save_app = False
        options.root_url = 'http://www.%s/' % options.server

    if options.application is None:
        if os.path.exists(META_FILENAME):
            parsed = json.loads(open(META_FILENAME, 'r').read())
        else:
            parsed = {}
        if 'application' in parsed:
            options.application = parsed['application']
            options.save_app = False
        else:
            options.application = raw_input("Application: ")

    if not hasattr(options, 'root_url'):
        options.root_url = 'http://%s.%s.%s/' % (ADMIN, options.application, options.server)

    print "Server: %s" % options.root_url


def load_options():
    """
    Load saved options from options file.   Don't override command line
    provided options.
    """
    options.local_only = options.command == 'sha1'
    options.save_app = True

    options.secret = None
    file_options = {}
    if os.path.exists(OPTIONS_FILENAME):
        file_options = json.loads(open(OPTIONS_FILENAME, 'r').read())

    for prop in file_options:
        if getattr(options, prop) is None:
            setattr(options, prop, file_options.get(prop))

    if not options.server:
        options.server = "pageforest.com"

    if not options.local_only:
        if not options.username:
            options.username = raw_input("Username: ")
        if not options.secret:
            if not options.password:
                from getpass import getpass
                options.password = getpass("Password: ")
            options.secret = hmac_sha1(options.password, options.username.lower())


def save_options():
    """
    Save options in options file for later use.
    """
    if options.local_only:
        return

    file_options = {}
    for prop in ['username', 'secret', 'server']:
        file_options[prop] = getattr(options, prop)

    if options.save_app:
        file_options['application'] = options.application

    open(OPTIONS_FILENAME, 'w').write(to_json(file_options))


def config():
    """
    Get configuration from command line, META_FILENAME and user input.
    """
    global options, commands

    commands = [function.split('_')[0] for function in globals()
                if function.endswith('_command')]
    commands.sort()
    usage = "usage: %prog [options] (" + '|'.join(commands) + ") [filenames]"
    for command in commands:
        usage += "\n%s: %s" % (command, globals()[command + '_command'].__doc__)

    parser = OptionParser(usage=usage)
    parser.add_option('-s', '--server', metavar='<hostname>',
        help="deploy to this server (default: pageforest.com")
    parser.add_option('-u', '--username')
    parser.add_option('-p', '--password')
    parser.add_option('-a', '--application')
    parser.add_option('-v', '--verbose', action='store_true')
    parser.add_option('-q', '--quiet', action='store_true')
    parser.add_option('-r', '--raw', action='store_true',
                      help="Default is to upload all files using base64 encoding.  "
                      "This option overrides and sends raw binary files.")
    parser.add_option('-f', '--force', action='store_true',
                      help="Ignore sha1 hashes and get/put all files.")
    parser.add_option('-n', '--noop', action='store_true',
                      help="don't perform update operations")
    options, args = parser.parse_args()

    if not args:
        parser.error("No command specified.")
    options.command = args.pop(0).lower().strip()
    if not options.command:
        parser.error("Empty command.")
    # Prefix expansion.
    for command in commands:
        if command.startswith(options.command):
            options.command = command
            break
    if options.command not in commands:
        parser.error("Unsupported command: " + options.command)

    load_options()
    load_application()

    return args


def url_from_filename(filename):
    urlpath = filename.replace('\\', '/')
    if urlpath.startswith('./'):
        urlpath = urlpath[2:]
    url = options.root_url + urllib.quote(urlpath)
    return url


def should_encode(filename):
    if options.raw or filename == META_FILENAME:
        return False
    return True


def upload_file(filename, url=None):
    """
    Upload one file to the server.
    """
    if url is None:
        url = url_from_filename(filename)
    data = open(filename, 'rb').read()
    if len(data) > MAX_FILE_SIZE:
        print "Skipping %s - file too large (%s bytes)." % \
              (filename, intcomma(len(data)))
        return
    keyname = filename.replace(os.path.sep, '/')
    # Check if the remote file is already up-to-date.
    if hasattr(options, 'listing') and keyname in options.listing:
        sha1 = sha1_file(filename, data)
        is_equal = options.listing[keyname]['sha1'] == sha1
        if options.verbose:
            print "SHA1 %s (local) %s %s (server) for %s" % \
                (sha1, is_equal and "==" or "!=", options.listing[keyname]['sha1'], filename)
        if not options.force and is_equal:
            return
    # Upload file to Pageforest backend.
    or_not = options.noop and " (Not!)" or ""
    if not options.quiet:
        print "Uploading: %s (%s bytes)%s" % (url, intcomma(len(data)), or_not)

    if options.noop:
        return

    # Some versions of python have problems with raw binary PUT's - treating data
    # as ascii and complaining.  So, use base64 transfer encoding.
    if should_encode(filename):
        data = b64encode(data)
        url += '?transfer-encoding=base64'
    response = urllib2.urlopen(PutRequest(url), data)
    if options.verbose:
        print "Response: %s" % response.read()


def delete_file(filename, url=None):
    """
    Delete one file from the server.
    """
    if url is None:
        url = url_from_filename(filename)
    or_not = options.noop and " (Not!)" or ""
    if not options.quiet:
        print "Deleting: %s%s" % (url, or_not)
    if options.noop:
        return

    response = urllib2.urlopen(DeleteRequest(url))
    if options.verbose:
        print "Response: %s" % response.read()


def download_file(filename, url=None):
    """
    Download a file from the server.
    """
    if url is None:
        url = url_from_filename(filename)
    # Check if the local file is already up-to-date.
    info = {}
    if hasattr(options, 'listing') and filename in options.listing:
        info = options.listing[filename]
        if not options.force and info['sha1'] == sha1_file(filename):
            if options.verbose:
                print "File hashes match: %s" % filename
            return
    # Download file from Pageforest backend.
    or_not = options.noop and " (Not!)" or ""
    if not options.quiet:
        if 'size' in info:
            print "Downloading: %s (%s bytes)%s" % (url, intcomma(info['size']), or_not)
        else:
            print "Downloading: %s%s" % (url, or_not)
    if not options.noop:
        response = urllib2.urlopen(AuthRequest(url))
        outfile = open(filename, 'wb')
        outfile.write(response.read())
        outfile.close()


def prefix_match(args, filename):
    """
    Check if the filename starts with one of the prefixes.
    """
    for arg in args:
        if filename.startswith(arg):
            return True


def pattern_match(patterns, filename):
    """
    Check if the filename matches any of the patterns.
    """
    for pattern in patterns:
        if fnmatch(filename, pattern):
            return True


def upload_dir(path):
    """
    Upload a directory, including all files and subdirectories.
    """
    for dirpath, dirnames, filenames in os.walk(path):
        for dirname in dirnames:
            if dirname.startswith('.'):
                dirnames.remove(dirname)
        for filename in filenames:
            if pattern_match(IGNORE_FILENAMES, filename):
                continue
            upload_file(os.path.join(dirpath, filename))


def to_json(d, extra=None, include=None, exclude=None, indent=2):
    """
    Serialize an object to json.
    """
    assert isinstance(d, dict)
    if exclude is None:
        exclude = ()
    result = {}
    for name in d:
        if exclude and name in exclude:
            continue
        if include and name not in include:
            continue
        result[name] = d[name]
    if extra:
        result.update(extra)
    if indent is None:
        return json.dumps(result, sort_keys=True,
                          separators=(',', ':'), cls=ModelEncoder)
    else:
        return json.dumps(result, sort_keys=True, cls=ModelEncoder,
                          indent=indent, separators=(',', ': ')) + '\n'


def sha1_file(filename, data=None):
    """
    Hash the contents of the file using SHA-1.
    """
    if not os.path.exists(filename):
        return None
    if data is None:
        infile = open(filename, 'rb')
        data = infile.read()
        infile.close()
    # Normalize document for sha1 computation.
    if filename == META_FILENAME:
        app = json.loads(data)
        data = to_json(app, exclude=('sha1', 'size', 'modified', 'created', 'application'))
    sha1 = hashlib.sha1(data).hexdigest()
    return sha1


def list_remote_files():
    """
    Get the list of files on the remote server, with metadata.
    """
    url = options.root_url + '?method=list&depth=0'
    options.listing = {}
    try:
        cursor_param = ""
        while True:
            response = urllib2.urlopen(AuthRequest(url + cursor_param))
            result = json.loads(response.read(), object_hook=as_datetime)
            # Change result of list command on 12/8/10
            if 'items' in result:
                options.listing.update(result['items'])
                if 'cursor' not in result:
                    break
                cursor_param = "&cursor=%s" % result['cursor']
                if options.verbose:
                    print "Paging: %s" % cursor_param
            else:
                options.listing = result
                break
    except urllib2.HTTPError, e:
        # For newly created apps - listing will return error.
        # Treat as empty on the server.
        options.listing = {}


def get_command(args):
    """
    Download all files for an app, except files that are already
    up-to-date (same SHA-1 hash as remote).
    """
    list_remote_files()
    download_file(META_FILENAME)
    filenames = options.listing.keys()
    filenames.sort()
    for filename in filenames:
        if filename == META_FILENAME:
            continue
        if args and not prefix_match(args, filename):
            continue
        # Make directory if needed.
        dirname = os.path.dirname(filename)
        if dirname and not os.path.exists(dirname):
            if options.verbose:
                print "Making directory: %s" % dirname
            os.makedirs(dirname)
        # Download file from Pageforest backend server.
        download_file(filename)


def put_command(args):
    """
    Upload all files for an app, except files that are already
    up-to-date (same SHA-1 hash as remote).
    """
    list_remote_files()
    if not args:
        args = [name for name in os.listdir('.')
                if not name.startswith('.')
                and not pattern_match(IGNORE_FILENAMES, name)]
    # REVIEW: The following doesn't work if you use "pf put <folder>"
    # to upload some files including META_FILENAME inside <folder>.
    # Should we require that "pf put" is always run in the same folder
    # where META_FILENAME lives?
    if META_FILENAME in args:
        upload_file(META_FILENAME)
        args.remove(META_FILENAME)
    if not args:
        return
    for path in args:
        if os.path.isdir(path):
            upload_dir(path)
        elif os.path.isfile(path):
            upload_file(path)


def delete_command(args):
    """
    Delete files from the server (leaves local files alone).

    If no filename is given, the entire app is deleted.
    """
    if not args:
        if if_yes("Are you sure you want to DELETE %s and all it's files from %s" %
                  (options.application, options.server)):
            delete_file(META_FILENAME)
        return

    list_remote_files()
    filenames = options.listing.keys()

    selected = []
    for filename in filenames:
        if args and not prefix_match(args, filename):
            continue
        selected.append(filename)

    delete_files(selected)


def if_yes(prompt):
    answer = raw_input("%s (yes/no)? " % prompt)
    f = answer.lower().startswith('y')
    if not f:
        print "I'll take that as a no."
    return f


def delete_files(filenames):
    if META_FILENAME in filenames:
        filenames.remove(META_FILENAME)

    if not filenames:
        print "No files to delete."
        return

    if not if_yes("Are you sure you want to DELETE %s files from %s" %
                  (intcomma(len(filenames)), options.server)):
        return

    filenames.sort()

    for filename in filenames:
        delete_file(filename)


def vacuum_command(args):
    """
    List remote files that no longer exist locally, then delete them
    (after prompting the user).
    """
    list_remote_files()
    filenames = options.listing.keys()
    selected = []
    for filename in filenames:
        if args and not prefix_match(args, filename):
            continue
        if os.path.isfile(filename):
            continue
        print_file_info(filename, options.listing[filename])
        selected.append(filename)

    delete_files(selected)


def print_file_info(filename, metadata):
    print '%s  %s  %s\t(%s bytes)' % (
        metadata['sha1'],
        metadata['modified'].strftime('%Y-%m-%d %H:%M:%S'),
        filename,
        intcomma(metadata['size']))


def list_command(args):
    """
    Show SHA-1 hash and filename for remote files. If args specified,
    only show files that start with one of args.
    """
    list_remote_files()
    filenames = options.listing.keys()
    filenames.sort()
    count = 0
    size = 0
    for filename in filenames:
        if args and not prefix_match(args, filename):
            continue
        print_file_info(filename, options.listing[filename])
        count += 1
        size += options.listing[filename]['size']
    print "%s files: %s Total bytes" % (intcomma(count), intcomma(size))


def sha1_command(args):
    """
    Print the SHA-1 hash of each file.
    """
    if not args:
        args = os.listdir('.')
    for path in args:
        if os.path.isdir(path):
            sha1_command([os.path.join(path, filename)
                          for filename in os.listdir(path)])
        if os.path.isfile(path):
            sha1 = sha1_file(path)
            print_file_info(path, {'sha1': sha1,
                                   'modified': datetime.fromtimestamp(os.path.getmtime(path)),
                                   'size': os.path.getsize(path)
                                   })


def listapps_command(args):
    """
    Display a list of apps that the user is allowed to write to.
    """
    url = options.root_url + 'apps?method=list'
    response = urllib2.urlopen(AuthRequest(url))
    result = json.loads(response.read(), object_hook=as_datetime)
    apps = result['items']
    print "Apps owned by you:"
    for app_name, app in apps.items():
        if app['owner'] == options.username:
            print app_name

    print "\nApps owned by others:"
    for app_name, app in apps.items():
        if app['owner'] != options.username:
            print "%s (by %s)" % (app_name, app['owner'])


def main():
    args = config()
    if not options.local_only:
        options.session_key = sign_in()
    globals()[options.command + '_command'](args)
    save_options()


if __name__ == '__main__':
    try:
        main()
    except urllib2.HTTPError, e:
        result = e.read()
        try:
            json_response = json.loads(result)
            if 'textStatus' in json_response:
                print "Error: %s" % json_response['textStatus']
            else:
                print json_response
        except:
            print "%s: %s - see pferror.html for details." % (e, e.url)
            error_file = open(ERROR_FILENAME, 'wb')
            error_file.write(result + '\n')
            error_file.close()

        exit(1)
