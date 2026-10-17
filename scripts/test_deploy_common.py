"""Tests for deploy_common.py. Run:  py -m unittest scripts/test_deploy_common.py -v   (from the project root)

Nothing here touches a network or a server: remote commands are only built as strings and inspected, and the deploy
control flow runs with every step stubbed."""
import argparse
import contextlib
import dataclasses
import datetime
import io
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import deploy_common as dc  # noqa: E402
import deploy_esf7_prod as prod  # noqa: E402
import deploy_esf7_staging as staging  # noqa: E402

ARGS = argparse.Namespace(skip_gate=False, ship_env=False)


class ExclusionFilter(unittest.TestCase):
    def test_never_ships_secrets_uploads_scratch_backups_or_test_scripts(self):
        for path in [
            ".env", "server/.env", ".env.production", "server/.env.staging",
            "server/uploads/a.png", "server\\uploads\\a.png",
            "server/scratch/seed.js", "server/backups/backup_school_1.json",
            "server/test_queue.js", "server\\test_insert_ld.js", "server/utils/test_helper.js",
            "server/tests/unit/x.test.js",
            "node_modules/x/index.js", "server/node_modules/x/index.js", "client\\node_modules\\x",
            ".git/config", "server/.git/HEAD", ".turbo/cache",
            "server/db/index.js.bak_20261008", "esf7-prod-deploy.tmp.tar.gz", "server/debug.log",
        ]:
            self.assertTrue(dc.should_exclude(path), path)

    def test_ships_the_application(self):
        for path in [
            "server", "server/server.js", "server/controllers/personnel/roster.js",
            "server/migrations/add_personnel_parity_columns.js", "server/scripts/check_merge_pipeline.js",
            "shared/schoolHead.js", "client/dist/index.html", "client/dist/assets/index-abc.js",
            "package.json", "ecosystem.esf7-staging.config.cjs", ".env.example", "server/.gitignore",
            "client/public/INSIGHTED LOADING.gif",
        ]:
            self.assertFalse(dc.should_exclude(path), path)

    def test_windows_backslashes_behave_like_slashes(self):
        for a, b in [("server\\uploads\\x", "server/uploads/x"), ("server\\test_a.js", "server/test_a.js")]:
            self.assertEqual(dc.should_exclude(a), dc.should_exclude(b))


class BuildInfo(unittest.TestCase):
    def test_contents(self):
        now = datetime.datetime(2026, 10, 17, 3, 4, 5, tzinfo=datetime.timezone.utc)
        info = dc.build_info("abc123", "main", "staging", now)
        self.assertEqual(info, {"sha": "abc123", "branch": "main", "builtAtUtc": "2026-10-17T03:04:05Z", "environment": "staging"})


class SameEnvironment(unittest.TestCase):
    STAGING_APPS = [
        {"name": "insighted-esf7-staging-backend", "port": 5035, "cwd": None, "logs": ["/mnt/insighted-esf7-staging/logs/error.log"]},
        {"name": "insighted-esf7-staging-worker", "port": 5035, "cwd": "/mnt/insighted-esf7-staging", "logs": []},
    ]

    def test_matching_config_is_accepted(self):
        self.assertEqual(dc.evaluate_consistency(staging.TARGET, self.STAGING_APPS), [])

    def test_both_scripts_agree_with_their_real_ecosystem_files(self):
        for target in (staging.TARGET, prod.TARGET):
            d = dc.Deployer(target, ARGS)
            with contextlib.redirect_stdout(io.StringIO()):
                d.check_consistency()  # reads the real ecosystem file; raises if it disagrees

    def test_prod_pm2_name_against_staging_everything_else_is_refused(self):
        bad = dataclasses.replace(staging.TARGET, pm2_name=prod.TARGET.pm2_name)
        self.assertTrue(dc.evaluate_consistency(bad, self.STAGING_APPS))

    def test_wrong_root_is_refused(self):
        bad = dataclasses.replace(prod.TARGET, remote_root=staging.TARGET.remote_root)
        apps = [{"name": prod.TARGET.pm2_name, "port": 5007, "cwd": "/var/www/html/InsightED-ROSDO/insighted-esf7-prod", "logs": []}]
        self.assertTrue(any("OTHER environment" in p for p in dc.evaluate_consistency(bad, apps)))

    def test_wrong_port_is_refused(self):
        bad = dataclasses.replace(staging.TARGET, port=5007)
        self.assertTrue(any("PORT" in p for p in dc.evaluate_consistency(bad, self.STAGING_APPS)))

    def test_the_two_environments_do_not_share_anything_that_matters(self):
        s, p = staging.TARGET, prod.TARGET
        for field in ("remote_root", "port", "pm2_name", "ecosystem_config", "archive_name", "db_name", "vite_base_path"):
            self.assertNotEqual(getattr(s, field), getattr(p, field), field)


class Pm2Check(unittest.TestCase):
    def proc(self, name, pm_id, status="online", restarts=0, unstable=0):
        return {"name": name, "pm_id": pm_id, "pm2_env": {"status": status, "restart_time": restarts, "unstable_restarts": unstable}}

    def test_healthy(self):
        a = [self.proc("app", 0), self.proc("app", 1)]
        self.assertEqual(dc.evaluate_pm2(a, a, ["app"]), [])

    def test_restart_loop_is_detected(self):
        a = [self.proc("app", 0, restarts=3)]
        b = [self.proc("app", 0, restarts=5)]
        self.assertTrue(any("restart loop" in p for p in dc.evaluate_pm2(a, b, ["app"])))

    def test_errored_and_missing_processes(self):
        self.assertTrue(dc.evaluate_pm2([self.proc("app", 0, status="errored")], [self.proc("app", 0, status="errored")], ["app"]))
        self.assertTrue(any("not running" in p for p in dc.evaluate_pm2([], [], ["app"])))


class HealthCheck(unittest.TestCase):
    OK = {"db": "up", "build": {"sha": "abc", "environment": "staging"}}

    def test_ok(self):
        self.assertEqual(dc.evaluate_health(self.OK, "abc", "staging"), [])

    def test_old_build_is_not_a_success(self):
        self.assertTrue(any("deployed" in p for p in dc.evaluate_health(self.OK, "def", "staging")))

    def test_server_reporting_no_build_means_old_code(self):
        self.assertTrue(dc.evaluate_health({"db": "up"}, "abc", "staging"))
        self.assertEqual(dc.evaluate_health({"db": "up"}, "abc", "staging", require_build=False), [])

    def test_wrong_environment_and_database_down(self):
        self.assertTrue(dc.evaluate_health({"db": "up", "build": {"sha": "abc", "environment": "production"}}, "abc", "staging"))
        self.assertTrue(dc.evaluate_health({"db": "down", "build": {"sha": "abc"}}, "abc", "staging"))

    def test_json_after_noise(self):
        self.assertEqual(dc.parse_json_from_output("[PM2] noise\n{\"db\": \"up\"}"), {"db": "up"})
        with self.assertRaises(ValueError):
            dc.parse_json_from_output("no json here")


class RemoteScripts(unittest.TestCase):
    def test_extract_keeps_uploads_logs_env_and_node_modules(self):
        script = dc.script_extract_install(staging.TARGET, ship_env=False)
        clear = dc.script_clear_stale(staging.TARGET)
        for keep in ("! -name node_modules", "! -name uploads", "! -name .env"):
            self.assertIn(keep, clear)
        self.assertNotIn("rm -rf logs", script)
        self.assertNotIn("rm -rf .env", script)
        self.assertNotIn("rm -rf server/uploads", script)
        self.assertIn("tar -xzf", script)

    def test_no_env_is_installed_unless_asked_and_never_over_an_existing_one(self):
        self.assertNotIn(".env.shipped", dc.script_extract_install(staging.TARGET, ship_env=False))
        with_env = dc.script_extract_install(staging.TARGET, ship_env=True)
        self.assertIn("[ -f .env ] && echo", with_env)  # existing file wins
        self.assertIn("rm -f .env.shipped", with_env)

    def test_restart_is_reload_if_it_exists_else_start_and_never_delete(self):
        for t in (staging.TARGET, prod.TARGET):
            script = dc.script_pm2_reload(t)
            self.assertIn(f"pm2 describe {t.pm2_name}", script)
            self.assertIn(f"pm2 reload {t.ecosystem_config} --update-env", script)
            self.assertIn(f"pm2 start {t.ecosystem_config} --update-env", script)
            self.assertNotIn("pm2 delete", script)

    def test_snapshot_goes_to_prev_without_logs_or_uploads(self):
        script = dc.script_snapshot(staging.TARGET)
        self.assertIn(staging.TARGET.remote_root + ".prev", script)
        self.assertIn("--exclude=./logs", script)
        self.assertIn("--exclude=./server/uploads", script)

    def test_rollback_restores_prev_but_not_uploads_logs_or_env(self):
        script = dc.script_rollback(prod.TARGET)
        self.assertIn(prod.TARGET.remote_root + ".prev", script)
        for kept in ("--exclude=./logs", "--exclude=./server/uploads", "--exclude=./.env", "--exclude=./server/.env"):
            self.assertIn(kept, script)
        self.assertIn("pm2 reload", script)
        self.assertIn("NO_PREVIOUS_RELEASE", script)

    def test_backup_refuses_the_wrong_database_and_migration_uses_the_apps_environment(self):
        for t in (staging.TARGET, prod.TARGET):
            self.assertIn(f"--expect-db {t.db_name}", dc.script_backup(t, "/x.dump"))
            self.assertIn(f"ESF7_ECOSYSTEM=../{t.ecosystem_config}", dc.node_with_env(t, "migrations/x.js"))
            self.assertIn("-r ./scripts/with_ecosystem_env.js", dc.node_with_env(t, "migrations/x.js"))

    def test_both_environments_run_the_parity_migration(self):
        for t in (staging.TARGET, prod.TARGET):
            self.assertIn("migrations/add_personnel_parity_columns.js", t.migrations)

    def test_smoke_test_covers_every_tag(self):
        script = dc.script_smoke(staging.TARGET)
        for tag, _ in dc.SMOKE_TAGS:
            self.assertIn(tag, script)
        self.assertIn(str(staging.TARGET.port), script)


class Gate(unittest.TestCase):
    def deployer(self, target, **flags):
        return dc.Deployer(target, argparse.Namespace(skip_gate=flags.get("skip_gate", False), ship_env=False))

    def fake_git(self, answers):
        def git(self_, *args):
            return answers.get(args, (0, ""))
        return git

    def test_dirty_tree_is_refused_on_both(self):
        for target in (staging.TARGET, prod.TARGET):
            d = self.deployer(target)
            answers = {("rev-parse", "HEAD"): (0, "a" * 40), ("rev-parse", "--abbrev-ref", "HEAD"): (0, "main"),
                       ("status", "--porcelain", "--untracked-files=no"): (0, " M server/server.js")}
            with mock.patch.object(dc.Deployer, "git", self.fake_git(answers)), contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(dc.DeployError, "uncommitted"):
                    d.gate()

    def test_staging_refuses_a_branch_behind_its_remote_and_prints_what_it_deploys(self):
        d = self.deployer(staging.TARGET)
        answers = {("rev-parse", "HEAD"): (0, "b" * 40), ("rev-parse", "--abbrev-ref", "HEAD"): (0, "main"),
                   ("status", "--porcelain", "--untracked-files=no"): (0, ""),
                   ("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"): (0, "origin/main"),
                   ("fetch", "--quiet"): (0, ""), ("rev-list", "--count", "HEAD..origin/main"): (0, "3")}
        out = io.StringIO()
        with mock.patch.object(dc.Deployer, "git", self.fake_git(answers)), contextlib.redirect_stdout(out):
            with self.assertRaisesRegex(dc.DeployError, "BEHIND"):
                d.gate()
        self.assertIn("main", out.getvalue())
        self.assertIn("bbbbbbbb", out.getvalue())

    def test_staging_passes_when_clean_and_up_to_date(self):
        d = self.deployer(staging.TARGET)
        answers = {("rev-parse", "HEAD"): (0, "c" * 40), ("rev-parse", "--abbrev-ref", "HEAD"): (0, "main"),
                   ("status", "--porcelain", "--untracked-files=no"): (0, ""),
                   ("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"): (0, "origin/main"),
                   ("fetch", "--quiet"): (0, ""), ("rev-list", "--count", "HEAD..origin/main"): (0, "0")}
        with mock.patch.object(dc.Deployer, "git", self.fake_git(answers)), contextlib.redirect_stdout(io.StringIO()):
            d.gate()
        self.assertEqual(d.sha, "c" * 40)

    def test_production_gate_is_not_bypassed_without_the_flag(self):
        d = self.deployer(prod.TARGET)
        answers = {("rev-parse", "HEAD"): (0, "d" * 40), ("rev-parse", "--abbrev-ref", "HEAD"): (0, "main"),
                   ("status", "--porcelain", "--untracked-files=no"): (0, "")}
        with mock.patch.object(dc.Deployer, "git", self.fake_git(answers)), \
                mock.patch("os.path.exists", return_value=False), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(dc.DeployError, "verify"):
                d.gate()

    def test_skip_gate_is_explicit_and_loud(self):
        d = self.deployer(prod.TARGET, skip_gate=True)
        answers = {("rev-parse", "HEAD"): (0, "e" * 40), ("rev-parse", "--abbrev-ref", "HEAD"): (0, "feature")}
        out = io.StringIO()
        with mock.patch.object(dc.Deployer, "git", self.fake_git(answers)), contextlib.redirect_stdout(out):
            d.gate()  # does not raise
        self.assertIn("--skip-gate", out.getvalue())
        self.assertIn("SKIPPED", out.getvalue())

    def test_production_gate_source_has_no_hardcoded_bypass(self):
        src = open(os.path.join(ROOT, "deploy_esf7_prod.py"), encoding="utf-8").read()
        self.assertNotIn("bypassed", src)
        common = open(os.path.join(ROOT, "deploy_common.py"), encoding="utf-8").read()
        self.assertNotIn("Deploy gate bypassed", common)


STEPS = ["gate", "check_consistency", "stream_precheck", "build", "make_archive", "engage_lock", "upload", "snapshot",
         "extract_and_install", "verify_build_info", "backup_and_migrate", "reload_pm2", "post_deploy_checks"]


class DeployFlow(unittest.TestCase):
    """The control flow with every step stubbed: what runs, in what order, and what is reported."""

    def run_deploy(self, fail_at=None, rollback_ok=True):
        d = dc.Deployer(staging.TARGET, ARGS)
        d.sha = "f" * 40
        calls = []

        def make(name):
            def step(*a, **k):
                calls.append(name)
                if name == "extract_and_install":
                    d.touched_server = True
                if name == fail_at:
                    raise dc.DeployError(f"{name} blew up")
            return step

        patches = [mock.patch.object(d, n, make(n)) for n in STEPS]
        patches.append(mock.patch.object(d, "release_lock", lambda: calls.append("release_lock")))
        patches.append(mock.patch.object(d, "cleanup_archive", lambda: calls.append("cleanup_archive")))
        patches.append(mock.patch.object(d, "rollback", lambda: (calls.append("rollback"), rollback_ok)[1]))
        out = io.StringIO()
        code = None
        with contextlib.ExitStack() as stack:
            for p in patches:
                stack.enter_context(p)
            stack.enter_context(contextlib.redirect_stdout(out))
            try:
                d.deploy()
            except SystemExit as e:
                code = e.code
        return calls, out.getvalue(), code

    def test_everything_passes_then_and_only_then_it_says_complete(self):
        calls, out, code = self.run_deploy()
        self.assertIsNone(code)
        self.assertIn("Deployment Complete", out)
        self.assertNotIn("rollback", calls)
        self.assertEqual([c for c in calls if c in STEPS], STEPS)
        # the new build is verified on the server BEFORE it is migrated or reloaded
        self.assertLess(calls.index("verify_build_info"), calls.index("backup_and_migrate"))
        self.assertLess(calls.index("backup_and_migrate"), calls.index("reload_pm2"))
        self.assertLess(calls.index("reload_pm2"), calls.index("post_deploy_checks"))

    def test_any_post_deploy_failure_rolls_back_exits_nonzero_and_never_says_complete(self):
        for step in ("verify_build_info", "backup_and_migrate", "reload_pm2", "post_deploy_checks", "extract_and_install"):
            calls, out, code = self.run_deploy(fail_at=step)
            self.assertEqual(code, 1, step)
            self.assertIn("rollback", calls, step)
            self.assertNotIn("Deployment Complete", out, step)
            self.assertIn("DEPLOY FAILED", out, step)

    def test_failure_before_the_server_is_touched_does_not_roll_back(self):
        for step in ("gate", "check_consistency", "build", "make_archive", "engage_lock", "upload", "snapshot"):
            calls, out, code = self.run_deploy(fail_at=step)
            self.assertEqual(code, 1, step)
            self.assertNotIn("rollback", calls, step)
            self.assertNotIn("Deployment Complete", out, step)
            self.assertIn("server was not modified", out, step)

    def test_lock_and_archive_are_always_cleaned_up(self):
        for step in (None, "upload", "post_deploy_checks"):
            calls, _, _ = self.run_deploy(fail_at=step)
            self.assertIn("release_lock", calls, step)
            self.assertIn("cleanup_archive", calls, step)
        calls, _, _ = self.run_deploy(fail_at="post_deploy_checks")
        self.assertLess(calls.index("rollback"), calls.index("release_lock"))

    def test_a_failed_rollback_is_reported_loudly(self):
        _, out, code = self.run_deploy(fail_at="post_deploy_checks", rollback_ok=False)
        self.assertEqual(code, 1)
        self.assertIn("ROLLBACK DID NOT SUCCEED", out)

    def test_check_failures_are_failures(self):
        d = dc.Deployer(staging.TARGET, ARGS)
        d.sha = "a" * 40
        bad = mock.Mock(returncode=0, stdout='{"db":"up","build":{"sha":"OLDOLDOLD","environment":"staging"}}')
        with mock.patch.object(d, "ssh", return_value=bad), mock.patch("time.sleep"), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(dc.DeployError):
                d.check_health(expect_sha=True, attempts=2)


class RunCommand(unittest.TestCase):
    def test_must_raises_instead_of_being_ignored(self):
        d = dc.Deployer(staging.TARGET, ARGS)
        with mock.patch("subprocess.run", return_value=mock.Mock(returncode=7, stdout="", stderr="")), \
                contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(dc.DeployError):
                d.run("false", must="boom")

    def test_retries_apply_only_to_connectivity_commands_and_default_to_one_attempt(self):
        d = dc.Deployer(staging.TARGET, ARGS)
        calls = []

        def fake_run(cmd, **kw):
            calls.append(cmd)
            return mock.Mock(returncode=1, stdout="", stderr="")

        with mock.patch("subprocess.run", fake_run), mock.patch("time.sleep"), contextlib.redirect_stdout(io.StringIO()):
            d.ssh("echo hi")  # default: a single attempt
            self.assertEqual(len(calls), 1)
            calls.clear()
            d.ssh("echo hi", retries=3)
            self.assertEqual(len(calls), 3)
            calls.clear()
            d.run("npm run build", retries=5)  # not a network command: never retried
            self.assertEqual(len(calls), 1)

    def test_the_slow_remote_step_is_not_retried_and_has_a_long_timeout(self):
        src = open(os.path.join(ROOT, "deploy_common.py"), encoding="utf-8").read()
        i = src.index("def extract_and_install")
        block = src[i:i + 400]
        self.assertIn("timeout=1500", block)
        self.assertNotIn("retries=", block)


class ArchiveContents(unittest.TestCase):
    def test_archive_has_build_info_and_no_secrets(self):
        import tarfile
        import tempfile
        d = dc.Deployer(staging.TARGET, ARGS)
        d.sha, d.branch = "9" * 40, "main"
        cwd = os.getcwd()
        with tempfile.TemporaryDirectory() as tmp:
            os.chdir(tmp)
            try:
                for path, text in {
                    "server/server.js": "x", "server/.env": "SECRET=1", "server/uploads/a.png": "x",
                    "server/test_insert_ld.js": "x", "server/utils/ok.js": "x", "shared/a.js": "x",
                    "client/dist/index.html": "x", "package.json": "{}", "package-lock.json": "{}",
                    staging.TARGET.ecosystem_config: "x", ".env": "SECRET=2",
                }.items():
                    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
                    open(path, "w").write(text)
                with contextlib.redirect_stdout(io.StringIO()):
                    d.make_archive()
                with tarfile.open(staging.TARGET.archive_name) as tar:
                    names = tar.getnames()
                    import json
                    info = json.load(tar.extractfile("BUILD_INFO.json"))
            finally:
                os.chdir(cwd)
        self.assertIn("BUILD_INFO.json", names)
        self.assertEqual(info["sha"], "9" * 40)
        self.assertEqual(info["environment"], "staging")
        for banned in ("server/.env", ".env", "server/uploads/a.png", "server/test_insert_ld.js"):
            self.assertNotIn(banned, names)
        for wanted in ("server/server.js", "server/utils/ok.js", "client/dist/index.html"):
            self.assertIn(wanted, names)


if __name__ == "__main__":
    unittest.main()


class OpsScriptsReachTheRealDatabase(unittest.TestCase):
    """PgBouncer runs on the VM and forwards to a remote server; the VM's own :5432 is a different Postgres. Ops scripts
    therefore get the real host explicitly (and only they do: never the app)."""

    def test_both_targets_pass_the_direct_host_to_ops_scripts(self):
        for t in (staging.TARGET, prod.TARGET):
            self.assertTrue(t.db_direct_host)
            self.assertIn(f"DB_DIRECT_HOST={t.db_direct_host} ", dc.node_with_env(t, "migrations/x.js"))
            self.assertIn(f"DB_DIRECT_HOST={t.db_direct_host} ", dc.script_backup(t, "/x.dump"))

    def test_the_app_start_command_does_not_get_it(self):
        for t in (staging.TARGET, prod.TARGET):
            self.assertNotIn("DB_DIRECT_HOST", dc.script_pm2_reload(t))
            self.assertNotIn("DB_DIRECT_HOST", dc.script_extract_install(t, False))
