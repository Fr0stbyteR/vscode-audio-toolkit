# Security and privacy

Local directory handles stay in the browser. Audio/score analyses that use the
configured backend send the selected file to that service; OMR sends selected
images/PDFs. Review the destination before using private media. Browser-only
waveform, spectrogram, markers, MusicXML and piano roll do not require uploading.

Backend URLs/tokens and directory handles can persist in the browser profile.
Use a trusted profile; clearing site data removes browser settings/handles.
Workspace analysis files may contain source names, user annotations and model
outputs. Treat `.audio_toolkit/` as private user data rather than release assets.

Never commit `.env`, tokens, local recordings or model caches. Every `VITE_*`
value is publicly readable after build. Do not embed a private API token into a
public distribution. The example development token is not production security.

Keep local APIs bound to loopback unless intentionally deploying them. Remote
APIs need HTTPS, authentication, explicit CORS configuration and upload limits.
The frontend does not turn an unauthenticated analysis service into a secure one.

Report vulnerabilities privately to the repository maintainer (or use GitHub
private vulnerability reporting when enabled). Do not post live credentials,
private audio, browser storage or sensitive backend logs in public issues.
