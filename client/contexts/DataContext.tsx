import React, { createContext, useState, useCallback, ReactNode } from "react";

export interface Review {
  id: number;
  author: string;
  date: string;
  createdAt?: string;
  verified: boolean;
  helpfulCount: number;
  overallRating: number;
  ratings: Record<string, number>;
  text?: string;
  managerCompany: string;
  managerTitle: string;
}

export interface CareerHistory {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
}

export interface Boss {
  id: number | string;
  name: string;
  company: string;
  title: string;
  image: string;
  overallRating: number;
  reviews: number;
  bio: string;
  status: "active" | "retired";
  categoryAverages: Record<string, number>;
  linkedinUrl?: string;
  createdAt?: string;
  careerHistory?: CareerHistory[];
}

export interface DataContextType {
  bosses: Boss[];
  reviews: Record<string | number, Review[]>;
  addBoss: (boss: Omit<Boss, "id" | "reviews" | "createdAt">) => Boss;
  addReview: (bossId: string | number, review: Omit<Review, "id" | "date">) => boolean;
  getBossReviews: (bossId: string | number) => Review[];
  getOrCreateBoss: (bossId: string | number) => Boss | null;
  hasUserReviewedManager: (bossId: string | number, author: string) => boolean;
  editManager: (bossId: string | number, updates: { company?: string; title?: string }) => boolean;
  updateReview: (bossId: string | number, reviewId: number, updates: Partial<Omit<Review, "id" | "date">>) => boolean;
  deleteReview: (bossId: string | number, reviewId: number) => boolean;
  getUserReviews: (author: string) => Array<{ boss: Boss; review: Review }>;
}

export const DataContext = createContext<DataContextType | undefined>(undefined);


export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [bosses, setBosses] = useState<Boss[]>([]);
  const [reviews, setReviews] = useState<Record<string | number, Review[]>>({});

  const addBoss = useCallback(
    (bossData: Omit<Boss, "id" | "reviews" | "createdAt">) => {
      const newBoss: Boss = {
        ...bossData,
        id: Math.max(0, ...bosses.map((b) => (typeof b.id === "number" ? b.id : 0))) + 1,
        reviews: 0,
        createdAt: new Date().toISOString(),
      };

      setBosses((prev) => [newBoss, ...prev]);
      setReviews((prev) => ({
        ...prev,
        [newBoss.id]: [],
      }));

      return newBoss;
    },
    [bosses]
  );

  const addReview = useCallback((bossId: string | number, reviewData: Omit<Review, "id" | "date">): boolean => {
    const bossReviews = reviews[bossId] || [];
    const hasUserReviewed = bossReviews.some((review) => review.author === reviewData.author);

    if (hasUserReviewed) {
      return false; // User has already reviewed this manager
    }

    setReviews((prevReviews) => {
      const currentBossReviews = prevReviews[bossId] || [];
      const now = new Date().toISOString();
      const newReview: Review = {
        ...reviewData,
        id: Math.max(0, ...currentBossReviews.map((r) => r.id)) + 1,
        date: "just now",
        createdAt: now,
      };

      const updatedReviews = {
        ...prevReviews,
        [bossId]: [newReview, ...currentBossReviews],
      };

      setBosses((prevBosses) =>
        prevBosses.map((boss) => {
          if (String(boss.id) === String(bossId)) {
            const allReviews = updatedReviews[bossId] || [];
            const newBossReviews = allReviews.length;

            const categoryAverages: Record<string, number> = {};
            const categoryCount: Record<string, number> = {};

            allReviews.forEach((review) => {
              Object.entries(review.ratings).forEach(([category, rating]) => {
                categoryAverages[category] = (categoryAverages[category] || 0) + rating;
                categoryCount[category] = (categoryCount[category] || 0) + 1;
              });
            });

            Object.keys(categoryAverages).forEach((category) => {
              categoryAverages[category] = parseFloat(
                (categoryAverages[category] / categoryCount[category]).toFixed(1)
              );
            });

            const overallRating =
              Object.values(categoryAverages).length > 0
                ? parseFloat(
                    (
                      Object.values(categoryAverages).reduce((a, b) => a + b, 0) /
                      Object.values(categoryAverages).length
                    ).toFixed(1)
                  )
                : 0;

            return {
              ...boss,
              reviews: newBossReviews,
              overallRating,
              categoryAverages,
            };
          }
          return boss;
        })
      );

      return updatedReviews;
    });

    return true; // Review was successfully added
  }, [reviews]);

  const getBossReviews = useCallback(
    (bossId: string | number): Review[] => {
      return reviews[bossId] || [];
    },
    [reviews]
  );

  const getOrCreateBoss = useCallback(
    (bossId: string | number): Boss | null => {
      const idStr = String(bossId);
      return bosses.find((b) => String(b.id) === idStr) || null;
    },
    [bosses]
  );

  const hasUserReviewedManager = useCallback(
    (bossId: string | number, author: string): boolean => {
      const bossReviews = reviews[bossId] || [];
      return bossReviews.some((review) => review.author === author);
    },
    [reviews]
  );

  const editManager = useCallback(
    (bossId: string | number, updates: { company?: string; title?: string }): boolean => {
      setBosses((prevBosses) =>
        prevBosses.map((boss) => {
          if (String(boss.id) === String(bossId)) {
            const updatedBoss = { ...boss };

            if (updates.company || updates.title) {
              const currentCompany = boss.company;
              const currentTitle = boss.title;

              if (!updatedBoss.careerHistory) {
                updatedBoss.careerHistory = [];
              }

              if (
                (updates.company && updates.company !== currentCompany) ||
                (updates.title && updates.title !== currentTitle)
              ) {
                updatedBoss.careerHistory.push({
                  company: currentCompany,
                  title: currentTitle,
                  startDate: updatedBoss.createdAt || new Date().toISOString(),
                  endDate: new Date().toISOString(),
                });
              }

              if (updates.company) {
                updatedBoss.company = updates.company;
              }
              if (updates.title) {
                updatedBoss.title = updates.title;
              }
            }

            return updatedBoss;
          }
          return boss;
        })
      );
      return true;
    },
    []
  );

  const updateReview = useCallback(
    (bossId: string | number, reviewId: number, updates: Partial<Omit<Review, "id" | "date">>) => {
      setReviews((prevReviews) => {
        const bossReviews = prevReviews[bossId] || [];
        const reviewIndex = bossReviews.findIndex((r) => r.id === reviewId);

        if (reviewIndex === -1) {
          return prevReviews;
        }

        const updatedReview = {
          ...bossReviews[reviewIndex],
          ...updates,
        };

        const updatedBossReviews = [...bossReviews];
        updatedBossReviews[reviewIndex] = updatedReview;

        const updatedReviewsMap = {
          ...prevReviews,
          [bossId]: updatedBossReviews,
        };

        setBosses((prevBosses) =>
          prevBosses.map((boss) => {
            if (String(boss.id) === String(bossId)) {
              const allReviews = updatedBossReviews;
              const categoryAverages: Record<string, number> = {};
              const categoryCount: Record<string, number> = {};

              allReviews.forEach((review) => {
                Object.entries(review.ratings).forEach(([category, rating]) => {
                  categoryAverages[category] = (categoryAverages[category] || 0) + rating;
                  categoryCount[category] = (categoryCount[category] || 0) + 1;
                });
              });

              Object.keys(categoryAverages).forEach((category) => {
                categoryAverages[category] = parseFloat(
                  (categoryAverages[category] / categoryCount[category]).toFixed(1)
                );
              });

              const overallRating =
                Object.values(categoryAverages).length > 0
                  ? parseFloat(
                      (
                        Object.values(categoryAverages).reduce((a, b) => a + b, 0) /
                        Object.values(categoryAverages).length
                      ).toFixed(1)
                    )
                  : 0;

              return {
                ...boss,
                overallRating,
                categoryAverages,
              };
            }
            return boss;
          })
        );

        return updatedReviewsMap;
      });

      return true;
    },
    []
  );

  const deleteReview = useCallback(
    (bossId: string | number, reviewId: number): boolean => {
      setReviews((prevReviews) => {
        const bossReviews = prevReviews[bossId] || [];
        const reviewIndex = bossReviews.findIndex((r) => r.id === reviewId);

        if (reviewIndex === -1) {
          return prevReviews;
        }

        const updatedBossReviews = bossReviews.filter((r) => r.id !== reviewId);

        const updatedReviewsMap = {
          ...prevReviews,
          [bossId]: updatedBossReviews,
        };

        setBosses((prevBosses) =>
          prevBosses.map((boss) => {
            if (String(boss.id) === String(bossId)) {
              const allReviews = updatedBossReviews;
              const newBossReviews = allReviews.length;

              const categoryAverages: Record<string, number> = {};
              const categoryCount: Record<string, number> = {};

              allReviews.forEach((review) => {
                Object.entries(review.ratings).forEach(([category, rating]) => {
                  categoryAverages[category] = (categoryAverages[category] || 0) + rating;
                  categoryCount[category] = (categoryCount[category] || 0) + 1;
                });
              });

              Object.keys(categoryAverages).forEach((category) => {
                categoryAverages[category] = parseFloat(
                  (categoryAverages[category] / categoryCount[category]).toFixed(1)
                );
              });

              const overallRating =
                Object.values(categoryAverages).length > 0
                  ? parseFloat(
                      (
                        Object.values(categoryAverages).reduce((a, b) => a + b, 0) /
                        Object.values(categoryAverages).length
                      ).toFixed(1)
                    )
                  : 0;

              return {
                ...boss,
                reviews: newBossReviews,
                overallRating,
                categoryAverages,
              };
            }
            return boss;
          })
        );

        return updatedReviewsMap;
      });

      return true;
    },
    []
  );

  const getUserReviews = useCallback(
    (author: string): Array<{ boss: Boss; review: Review }> => {
      const userReviews: Array<{ boss: Boss; review: Review }> = [];

      Object.entries(reviews).forEach(([bossId, bossReviews]) => {
        const boss = bosses.find((b) => String(b.id) === String(bossId));
        if (boss) {
          bossReviews.forEach((review) => {
            if (review.author === author) {
              userReviews.push({ boss, review });
            }
          });
        }
      });

      return userReviews;
    },
    [bosses, reviews]
  );

  const value: DataContextType = {
    bosses,
    reviews,
    addBoss,
    addReview,
    getBossReviews,
    getOrCreateBoss,
    hasUserReviewedManager,
    editManager,
    updateReview,
    deleteReview,
    getUserReviews,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};