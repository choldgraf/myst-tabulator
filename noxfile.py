import nox


@nox.session
def docs(session):
    """Build the documentation."""
    with session.chdir("docs"):
        session.run("npx", "mystmd", "build", "--execute", "--html", external=True)


@nox.session(name="docs-live")
def docs_live(session):
    """Start a live development server."""
    with session.chdir("docs"):
        session.run("npx", "mystmd", "start", "--execute", external=True)
