# Agent Skills

Save these as your agent's skill files (e.g.
`~/.claude/skills/readme-assert.md` for
[Claude Code](https://docs.claude.com/claude-code)).

## /readme-assert

Invoke with `/readme-assert` to run readme-assert and walk through any failures.

````markdown
--8<-- ".claude/skills/readme-assert.md"
````

## /readme-assertify

Invoke with `/readme-assertify` to convert an existing README into a
readme-assert-compatible one by adding `test` tags and `//=>` assertion
comments.

````markdown
--8<-- ".claude/skills/readme-assertify.md"
````
