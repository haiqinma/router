package dashboard

// DutyChannelHealth is the channel health projection consumed by the duty
// station. It deliberately exposes observation facts separately from health.
type DutyChannelHealth struct {
	ID                   string
	Name                 string
	HealthLevel          string
	PassRate             float64
	CoverageRate         float64
	LastTestedAt         int64
	HasTestData          bool
	CircuitBreakerActive bool
	BillingLevel         string
}

// DutyModelHealth is the model health projection consumed by the duty station.
type DutyModelHealth struct {
	Name               string
	HealthLevel        string
	ChannelCount       int
	TestedChannelCount int
	PassRate           float64
	LastTestedAt       int64
}

func ListDutyChannelHealth() ([]DutyChannelHealth, error) {
	items, _, err := listDashboardChannelsWithLimit(0)
	if err != nil {
		return nil, err
	}
	result := make([]DutyChannelHealth, 0, len(items))
	for _, item := range items {
		result = append(result, DutyChannelHealth{
			ID:                   item.ID,
			Name:                 item.Name,
			HealthLevel:          item.HealthLevel,
			PassRate:             item.PassRate,
			CoverageRate:         item.CoverageRate,
			LastTestedAt:         item.LastTestedAt,
			HasTestData:          item.HasTestData,
			CircuitBreakerActive: isActiveDashboardCircuitBreaker(item.CircuitBreaker),
			BillingLevel:         item.BillingLevel,
		})
	}
	return result, nil
}

func ListDutyModelHealth(startAt int64, endAt int64) ([]DutyModelHealth, error) {
	_, items, err := buildModelDashboard(startAt, endAt, 0)
	if err != nil {
		return nil, err
	}
	result := make([]DutyModelHealth, 0, len(items))
	for _, item := range items {
		result = append(result, DutyModelHealth{
			Name:               item.Model,
			HealthLevel:        item.HealthLevel,
			ChannelCount:       item.ChannelCount,
			TestedChannelCount: item.TestedChannelCount,
			PassRate:           item.PassRate,
			LastTestedAt:       item.LastTestedAt,
		})
	}
	return result, nil
}
