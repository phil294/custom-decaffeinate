#!/bin/bash
set -Ceo pipefail
shopt -s globstar
shopt -s nullglob
shopt -s nocaseglob
shopt -s extglob

# in node_modules/slm/lib/vm.js escape fun prevent escaping

yarn eslint --version || { echo 'ESLint not installed'; exit 1 ;}

compile() {
	# pretty good but the below custom transforms seem to work better overall
	# yarn decaffeinate --use-cs2 --prefer-let --loose --optional-chaining --nullish-coalescing "$1"

	node ~1/transform-coffee.js "$1" \
		| sed -E 's/(^|\s)var /\1let /g' \
		| sed -E 's/void 0/undefined/g' \
		| sed -E 's/(`.*)\\"/\1"/g' \
		| sed -E 's/(`.*)\\"/\1"/g' \
		| sed -E 's/(`.*)\\"/\1"/g' \
		| sed -E 's/(`.*)\\"/\1"/g' \
		| sed -E 's/ \*\/([a-z_$])/ *\/ \1/g' \
		| sed -E 's/^(\s*)let +(\S+) = (async )?function\(/\1\3function \2(/g'
}

vue_regex='^<template lang="slm">\n+(.+)\n+<\/template>\n+<script lang="coffee"([^>]*)>(.*?)<\/script>((\n+<style lang="stylus"([^>]*)>)(.*)(<\/style>.*))?'

for dir in src web/src; do
	pushd "$dir"

	for cs in **/*.coffee; do
		echo "$cs"
		js="${cs::-7}".js

		# compile "$cs" >| "$js"
		compile "$cs" >| "$cs"

		# break
	done

	for vue in **/*.vue; do
		echo $vue
		a2=$(perl -0777 -pe "s/$vue_regex/\2/s" "$vue")
		a6=$(perl -0777 -pe "s/$vue_regex/\6/s" "$vue")
		a8=$(perl -0777 -pe "s/$vue_regex/\8/s" "$vue")

		perl -0777 -pe "s/$vue_regex/\1/s" "$vue" >|tmp.slm
		echo 'console.log(require("slm").compile(require("fs").readFileSync("tmp.slm","utf8"), {})())' >| do-slm.js
		html=$(node do-slm.js | sed -E 's/></>\n</g')
		rm do-slm.js tmp.slm
		perl -0777 -pe "s/$vue_regex/\3/s" "$vue" >|tmp.cof
		js=$(compile tmp.cof)
		rm tmp.cof
		styl=$(perl -0777 -pe "s/$vue_regex/\7/s" "$vue")
		css=$(yarn run --silent stylus <<<"$styl" | sed -E 's/  /\t/g')
		echo -e "<template>\n${html}\n</template>\n<script${a2}>${js}\n</script>\n<style${a6}>\n${css}\n${a8}" \
			|sed -E 's/.coffee//g' \
			|perl -0777 -pe 's/>\n<\/script>/><\/script>/g' \
			>| "$vue"
		# exit 4
	done

	popd

	# yarn eslint --stdin --fix-dry-run doesnt work: doesn't print the result but only the detected errors. wtf? using tmp file instead:
	# yarn eslint --fix tmp.js || : # -o /dev/null

	yarn eslint --fix "$dir"/**/*.{js,vue} || : # -o /dev/null
done
