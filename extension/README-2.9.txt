Beacon 2.9 — Experimental Express JSON-rule adapter

UPDATE: Back up your working Beacon extension folder, overwrite with these files in the SAME folder, then Reload in chrome://extensions. Saved settings are not intentionally reset.

Under Media Hub > Vendors & Packages, paste a direct HTTPS URL to a Syncler Express JSON package and select Inspect / import package. This inspects rule definitions and disables them by default. Only JSON-rule providers without token requirements or sub-results are candidates for execution. HTML parser expressions, script packages, anti-bot bypass and Syncler v2-specific operations are NOT implemented. Enabled rule candidates may still fail due to CORS, dead sites, protocol differences, inaccessible media or missing format features.

Use only providers permitting automated access and content you are authorized to access. This build DOES NOT guarantee arbitrary modern movie availability. Browser validation / provider end-to-end tests are still required.
