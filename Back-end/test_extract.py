from tracer.extract import fallback, _parse, _from_dict


def test_percent_claim():
    c = fallback("India's literacy rate is 77%")
    assert (c.value, c.unit, c.place, c.metric) == (77.0, "%", "India", "literacy rate")


def test_billion_claim():
    c = fallback("China's population is 1.4 billion")
    assert c.value == 1.4e9 and c.place == "China" and c.metric == "population"


def test_year_is_not_the_value():
    c = fallback("Life expectancy in India was 70 years in 2019")
    assert c.value == 70.0 and c.year == 2019


def test_no_number():
    assert fallback("The weather is nice") is None


def test_parse_handles_wrapped_json():
    assert _parse('Sure! {"value": 5} done')["value"] == 5


def test_null_value_means_no_claim():
    assert _from_dict("x", {"value": None, "metric": "m"}) is None
