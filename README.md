# RDF Turtle Editor

This repository contains source code of RDF Turtle Editor with following features;

- RDF turtle syntax highlighting 
- Live RDF turtle syntax validation
- Checks conformance of RDF document with Web of Data
- Parses prefixed ontologies and adds as part of auto-completion
- Makes newly defined terms in current document part of auto-completion
- Parses prefixed ontologies in both rdf+xml and turtle format
- ...and many more
- Compatible with [RDFJS task force spec](https://github.com/rdfjs/representation-task-force/blob/master/interface-spec.md)


# Gettig Started

In order to deploy your own copy of the RDF turle editor, below procedure can be applied;

    $ git clone <url-of-this-repo>
    $ cd <reponame>
    $ npm start

# Starting as PM2 Process

This is possible to start the editor as a pm2 process;

    $ git clone <url-of-this-repo>
    $ cd <reponame>
    $ pm2 start "npm" --name "rdfeditor" -- start 

# Acknowledgements

Special thanks goes to;
- Data team for [rdflib.js](https://github.com/linkeddata/rdflib.js)
- Contributors behind [ace editor](https://github.com/ajaxorg/ace) that rdfturtleditor uses to incorporate turtle format specifications
- [Prefix.cc](http://prefix.cc/) that is used to fetch popular prefixes for prefix auto-completion