import unittest
from admin_settings import parse_admin_codes, list_storage_names


class SettingsContractTests(unittest.TestCase):
    def test_current_settings_and_deduplication(self):
        self.assertEqual(parse_admin_codes({"adCodes": [" a ", "b", "a", ""]}), ["a", "b"])

    def test_current_overrides_legacy(self):
        self.assertEqual(parse_admin_codes({"adCodes": ["new"], "clarityTargetUrls": ["old"]}), ["new"])

    def test_explicit_empty_current_never_resurrects_legacy(self):
        with self.assertRaises(ValueError):
            parse_admin_codes({"adCodes": [], "clarityTargetUrls": ["stale"]})

    def test_legacy_plural_and_singular(self):
        self.assertEqual(parse_admin_codes({"clarityTargetUrls": ["old"]}), ["old"])
        self.assertEqual(parse_admin_codes({"clarityTargetUrl": "single"}), ["single"])

    def test_invalid_or_empty_aborts(self):
        for value in [{}, None, {"adCodes": "abc"}, {"adCodes": [3]}, {"adCodes": [" "]}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                parse_admin_codes(value)

    def test_pagination_and_deterministic_sort(self):
        calls = []

        class Response:
            def __init__(self, items):
                self.items = items
            def raise_for_status(self):
                pass
            def json(self):
                return self.items

        def post(url, **kwargs):
            options = kwargs["json"]
            calls.append(options)
            return Response([{"name": str(i)} for i in range(options["offset"], min(5, options["offset"] + 2))])

        self.assertEqual(list_storage_names(post, "storage", {}, "date/", limit=2), set("01234"))
        self.assertEqual([call["offset"] for call in calls], [0, 2, 4])
        self.assertTrue(all(call["sortBy"]["column"] == "name" for call in calls))

    def test_listing_failure_never_becomes_an_empty_folder(self):
        def post(*args, **kwargs):
            raise RuntimeError("unavailable")
        with self.assertRaises(RuntimeError):
            list_storage_names(post, "storage", {}, "date/")


if __name__ == "__main__":
    unittest.main()
