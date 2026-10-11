<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Catalogue and demo memories live in src/lib/*.ts until Cloud is enabled; cart is a localStorage external store (src/lib/cart.ts) — swap source later without touching pages.
- Immersive /m/* routes hide site chrome in __root — memory pages must feel standalone.
